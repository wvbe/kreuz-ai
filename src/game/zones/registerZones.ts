import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { hasComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { InitMode } from "../engine/engineSystemTypes";
import { TickSlot } from "../engine/TickPipeline";
import { jobsSystemId } from "../jobs/jobTypes";
import { assertFilterKnown, normalizeFilter } from "../storage/materialFilter";
import { furnitureComponent } from "../storage/furnitureComponent";
import { getStorageService } from "../storage/storageServiceRegistry";
import { storageSystemId } from "../storage/storageTypes";
import { ZoneService } from "./ZoneService";
import { zoneComponent } from "./zoneComponent";
import { bindZoneService, getZoneService } from "./zoneServiceRegistry";
import { buildMergeOffers, buildZoneView, buildZoneViews } from "./zoneViews";
import { zonesSystemId } from "./zoneTypes";

const registered = new WeakSet<GameEngine>();

const cellsSchema = z.array(z.number().int().min(0)).min(1);
const filterSchema = z
  .object({
    categories: z.array(z.string().min(1)).optional(),
    materialIds: z.array(z.string().min(1)).optional(),
  })
  .strict();
const zoneIdSchema = z.number().int().min(1);

/**
 * Registers zones with an engine (once per engine; the engine does it for itself, so every game
 * has it, after storage). It adds:
 * - the component `Zone` (the `zone` prototype carries it), the save section `systems.zones`
 *   (merge offers) and the slot-9 system `zones` that re-derives every zone each tick (room,
 *   status, gaps, `zone.requirements.*`, merge offers, system pause of boards) and once, silently,
 *   after `newGame` and `loadGame`;
 * - the zone hooks of storage: tiers 0 and 1, stockpile zones, the zone filter, the dwelling
 *   exclusion and the decay modifier of zone effects (Pantry);
 * - the commands `DesignateZone`, `AddZoneTiles`, `RemoveZoneTiles`, `DeleteZone`,
 *   `ConfirmZoneMerge` and `SetZoneMaterialFilter` (DECISIONS section 3.4) and the queries
 *   `zones {mapId?}`, `zone {zoneId}`, `zone-at {mapId, cellIndex}` and `zone-merge-offers {}`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerStorage`.
 * @returns The engine's zone service.
 */
export function registerZones(engine: GameEngine): ZoneService {
  if (registered.has(engine)) {
    return getZoneService(engine);
  }
  registered.add(engine);
  const service = new ZoneService(engine);
  bindZoneService(engine, service);
  const storage = getStorageService(engine);
  storage.setZoneRouteProvider((mapId, cellIndex) => service.routeInfoAt(mapId, cellIndex));
  storage.addDecayModifierSource((_engine, entity) =>
    hasComponent(entity, furnitureComponent) ? service.decayModifierAt(entity) : null,
  );
  engine.registerSystem({
    id: zonesSystemId,
    dependencies: [storageSystemId, jobsSystemId],
    slot: TickSlot.Zones,
    components: [zoneComponent],
    saveSection: service.createSection(),
    init: ({ engine: target, mode }) => {
      if (mode === InitMode.LoadGame || mode === InitMode.NewGame) {
        service.rebuildIndex();
        service.evaluateAll(target.time.tickCount, false);
      }
    },
    run: (context) => {
      service.evaluateAll(context.tick, true);
    },
    commandHandlers: {
      DesignateZone: defineCommand({
        schema: z
          .object({
            zoneTypeId: z.string().min(1),
            mapId: z.number().int().min(0),
            cells: cellsSchema,
            reassign: z.boolean().optional(),
          })
          .strict(),
        handler: (payload) => ({
          zoneIds: service.designate(
            payload.zoneTypeId,
            payload.mapId,
            payload.cells,
            payload.reassign ?? false,
          ),
        }),
      }),
      AddZoneTiles: defineCommand({
        schema: z
          .object({ zoneId: zoneIdSchema, cells: cellsSchema, reassign: z.boolean().optional() })
          .strict(),
        handler: (payload) => {
          const change = service.addTiles(payload.zoneId, payload.cells, payload.reassign ?? false);
          return { zoneId: change.zoneId, newZoneIds: change.newZoneIds };
        },
      }),
      RemoveZoneTiles: defineCommand({
        schema: z.object({ zoneId: zoneIdSchema, cells: cellsSchema }).strict(),
        handler: (payload) => {
          const change = service.removeTiles(payload.zoneId, payload.cells);
          return { zoneId: change.zoneId, newZoneIds: change.newZoneIds };
        },
      }),
      DeleteZone: defineCommand({
        schema: z.object({ zoneId: zoneIdSchema }).strict(),
        handler: (payload) => {
          service.deleteZone(payload.zoneId);
          return { zoneId: payload.zoneId };
        },
      }),
      ConfirmZoneMerge: defineCommand({
        schema: z.object({ offerId: z.number().int().min(1), accept: z.boolean() }).strict(),
        handler: (payload) => ({
          survivorId: service.confirmMerge(payload.offerId, payload.accept),
        }),
      }),
      SetZoneMaterialFilter: defineCommand({
        schema: z.object({ zoneId: zoneIdSchema, filter: filterSchema.nullable() }).strict(),
        handler: (payload, target) => {
          service.requireZone(payload.zoneId);
          const filter = normalizeFilter(payload.filter);
          assertFilterKnown(target, filter);
          service.setFilter(payload.zoneId, filter);
          return { zoneId: payload.zoneId };
        },
      }),
    },
    queries: {
      zones: defineQuery({
        schema: z.object({ mapId: z.number().int().min(0).optional() }).strict(),
        run: ({ mapId }, target) => buildZoneViews(target, mapId),
      }),
      zone: defineQuery({
        schema: z.object({ zoneId: zoneIdSchema }).strict(),
        run: ({ zoneId }, target) => buildZoneView(target, zoneId),
      }),
      "zone-at": defineQuery({
        schema: z
          .object({ mapId: z.number().int().min(0), cellIndex: z.number().int().min(0) })
          .strict(),
        run: ({ mapId, cellIndex }, target) => {
          const zoneId = getZoneService(target).zoneIdAt(mapId, cellIndex);
          return zoneId === null ? null : buildZoneView(target, zoneId);
        },
      }),
      "zone-merge-offers": defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) => buildMergeOffers(target),
      }),
    },
  });
  return service;
}
