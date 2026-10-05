import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import type { GameEngine } from "../engine/GameEngine";
import { InitMode } from "../engine/engineSystemTypes";
import { TickSlot } from "../engine/TickPipeline";
import { jobsSystemId } from "../jobs/jobTypes";
import { storageSystemId } from "../storage/storageTypes";
import { zonesSystemId } from "../zones/zoneTypes";
import { buildSiteComponent } from "./buildSiteComponent";
import { ConstructionService } from "./ConstructionService";
import { postSiteJobs, sweepSites } from "./constructionPoster";
import { bindConstructionService, getConstructionService } from "./constructionServiceRegistry";
import {
  cancelSite,
  moveSiteToFront,
  queueConstruction,
  queueDeconstruction,
  queueWalls,
  setSitePaused,
  setSitePriority,
} from "./constructionSites";
import { constructionSystemId, doorPrototypeId, wallPrototypeId } from "./constructionTypes";
import { buildMenuView, buildQueueView, buildSiteDetail } from "./constructionViews";
import { registerConstruct } from "./constructExecutor";
import { validatePlacement } from "./placement";
import { destroySite } from "./siteRefund";
import { registerSupply } from "./supplyExecutor";
import {
  applyWallObstruction,
  clearWallObstruction,
  rebuildWallObstructions,
} from "./wallObstruction";

const registered = new WeakSet<GameEngine>();

const idSchema = z.number().int().min(1);
const cellSchema = z.number().int().min(0);
const prioritySchema = z.number().int().min(0).max(100);

/**
 * Registers construction with an engine (once per engine; the engine does it for itself, so every
 * game has it, after production). It adds:
 * - the component `BuildSite` (the `build_site` prototype carries it, with a non-queryable staging
 *   inventory) and the save section `systems.construction` (the recently finished jobs);
 * - the executors of the job types `build.supply` and `build.construct`;
 * - before-delete hooks: a deleted build site gives its staged materials back, a deleted wall
 *   frees its cell; a subscription on `entity.spawned` and an init step that derive the wall
 *   obstructions of the map from the wall entities (so a wall from any source obstructs, after a
 *   load too);
 * - the slot-8 system `construction`: every tick it sweeps lost builders and suppliers, updates
 *   progress and statuses and cancels jobs that lost their place; every 6 ticks it posts
 *   `build.supply` and `build.construct` jobs;
 * - the commands `QueueConstruction`, `QueueWalls`, `QueueDeconstruction`, `CancelConstructionJob`,
 *   `SetConstructionJobPaused`, `SetConstructionPriority`, `MoveConstructionJobToFront` (DECISIONS
 *   section 3.3) and the player-facing aliases `PlaceFurniture {furnitureId, mapId, cell}`,
 *   `PlaceWall {mapId, cells}`, `PlaceDoor {mapId, cell}`, `CancelConstruction {jobId}`;
 * - the queries `construction-queue {mapId?}`, `site {jobId}`, `validate-placement
 *   {prototypeId, mapId, cellIndex}` and `build-menu {}`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerProduction`.
 * @returns The engine's construction service.
 */
export function registerConstruction(engine: GameEngine): ConstructionService {
  if (registered.has(engine)) {
    return getConstructionService(engine);
  }
  registered.add(engine);
  const service = new ConstructionService();
  bindConstructionService(engine, service);
  registerSupply(engine);
  registerConstruct(engine);
  engine.store.addBeforeDeleteHook((entity) => {
    destroySite(engine, entity);
    clearWallObstruction(engine, entity);
    return null;
  });
  engine.bus.subscribe("entity.spawned", (payload) => {
    const entityId =
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? payload["entityId"]
        : undefined;
    const entity = typeof entityId === "number" ? engine.store.get(entityId) : undefined;
    if (entity !== undefined) {
      applyWallObstruction(engine, entity);
    }
  });
  const queue = defineCommand({
    schema: z
      .object({
        prototypeId: z.string().min(1),
        mapId: cellSchema,
        cellIndex: cellSchema,
        priority: prioritySchema.optional(),
        urgent: z.boolean().optional(),
      })
      .strict(),
    handler: (payload, target) => ({
      jobId: queueConstruction(target, payload).entity.id,
    }),
  });
  const queueWallsCommand = defineCommand({
    schema: z
      .object({
        prototypeId: z.string().min(1),
        mapId: cellSchema,
        cells: z.array(cellSchema).min(1),
        priority: prioritySchema.optional(),
      })
      .strict(),
    handler: (payload, target) => ({
      jobIds: queueWalls(
        target,
        payload.prototypeId,
        payload.mapId,
        payload.cells,
        payload.priority,
      ).map((site) => site.entity.id),
    }),
  });
  const cancel = defineCommand({
    schema: z.object({ jobId: idSchema }).strict(),
    handler: (payload, target) => {
      cancelSite(target, payload.jobId);
      return { jobId: payload.jobId };
    },
  });
  engine.registerSystem({
    id: constructionSystemId,
    dependencies: [aiSystemId, jobsSystemId, storageSystemId, zonesSystemId],
    slot: TickSlot.ProductionAndConstruction,
    components: [buildSiteComponent],
    saveSection: service.createSection(),
    init: ({ engine: target, mode }) => {
      if (mode === InitMode.LoadGame || mode === InitMode.NewGame) {
        rebuildWallObstructions(target);
      }
    },
    run: (context) => {
      sweepSites(engine, context.tick);
      postSiteJobs(engine, context.tick);
    },
    commandHandlers: {
      QueueConstruction: queue,
      QueueWalls: queueWallsCommand,
      QueueDeconstruction: defineCommand({
        schema: z
          .object({ targetEntityId: idSchema, priority: prioritySchema.optional() })
          .strict(),
        handler: (payload, target) => ({
          jobId: queueDeconstruction(target, payload.targetEntityId, payload.priority).entity.id,
        }),
      }),
      CancelConstructionJob: cancel,
      SetConstructionJobPaused: defineCommand({
        schema: z.object({ jobId: idSchema, paused: z.boolean() }).strict(),
        handler: (payload, target) => ({
          jobId: setSitePaused(target, payload.jobId, payload.paused).entity.id,
        }),
      }),
      SetConstructionPriority: defineCommand({
        schema: z
          .object({ jobId: idSchema, priority: z.number().int(), urgent: z.boolean().optional() })
          .strict(),
        handler: (payload, target) => ({
          jobId: setSitePriority(target, payload.jobId, payload.priority, payload.urgent).entity.id,
        }),
      }),
      MoveConstructionJobToFront: defineCommand({
        schema: z.object({ jobId: idSchema }).strict(),
        handler: (payload, target) => ({
          jobId: moveSiteToFront(target, payload.jobId).entity.id,
        }),
      }),
      PlaceFurniture: defineCommand({
        schema: z
          .object({
            furnitureId: z.string().min(1),
            mapId: cellSchema,
            cell: cellSchema,
            priority: prioritySchema.optional(),
          })
          .strict(),
        handler: (payload, target) => ({
          jobId: queueConstruction(target, {
            prototypeId: payload.furnitureId,
            mapId: payload.mapId,
            cellIndex: payload.cell,
            priority: payload.priority,
          }).entity.id,
        }),
      }),
      PlaceWall: defineCommand({
        schema: z
          .object({
            mapId: cellSchema,
            cells: z.array(cellSchema).min(1),
            priority: prioritySchema.optional(),
          })
          .strict(),
        handler: (payload, target) => ({
          jobIds: queueWalls(
            target,
            wallPrototypeId,
            payload.mapId,
            payload.cells,
            payload.priority,
          ).map((site) => site.entity.id),
        }),
      }),
      PlaceDoor: defineCommand({
        schema: z
          .object({ mapId: cellSchema, cell: cellSchema, priority: prioritySchema.optional() })
          .strict(),
        handler: (payload, target) => ({
          jobIds: queueWalls(
            target,
            doorPrototypeId,
            payload.mapId,
            [payload.cell],
            payload.priority,
          ).map((site) => site.entity.id),
        }),
      }),
      CancelConstruction: cancel,
    },
    queries: {
      "construction-queue": defineQuery({
        schema: z.object({ mapId: cellSchema.optional() }).strict(),
        run: ({ mapId }, target) => buildQueueView(target, mapId),
      }),
      site: defineQuery({
        schema: z.object({ jobId: idSchema }).strict(),
        run: ({ jobId }, target) => buildSiteDetail(target, jobId),
      }),
      "validate-placement": defineQuery({
        schema: z
          .object({ prototypeId: z.string().min(1), mapId: cellSchema, cellIndex: cellSchema })
          .strict(),
        run: ({ prototypeId, mapId, cellIndex }, target) =>
          validatePlacement(target, prototypeId, mapId, cellIndex),
      }),
      "build-menu": defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) => buildMenuView(target),
      }),
    },
  });
  return service;
}
