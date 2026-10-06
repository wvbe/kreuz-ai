import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import { getCrierService } from "../crier/crierServiceRegistry";
import { crierSystemId } from "../crier/crierTypes";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { factionsSystemId } from "../factions/factionTypes";
import { jobsSystemId } from "../jobs/jobTypes";
import { productionSystemId } from "../production/productionTypes";
import { getStatusService } from "../status/statusServiceRegistry";
import { storageSystemId } from "../storage/storageTypes";
import { zonesSystemId } from "../zones/zoneTypes";
import { getStorageService } from "../storage/storageServiceRegistry";
import { createAudienceTask } from "./createAudienceTask";
import { noticePostRoute, ringBells } from "./deliveryRouting";
import { applyRun, pruneRuns } from "./ownedRuns";
import { preferredZone } from "./preferredZone";
import { runStewardReview } from "./runStewardReview";
import { StandingService } from "./StandingService";
import { bindStandingService, getStandingService } from "./standingServiceRegistry";
import {
  createStandingOrder,
  deleteStandingOrder,
  dropFinishedOrders,
  setStandingOrderPaused,
  updateStandingOrder,
} from "./standingOrders";
import { standingProvider } from "./standingProvider";
import { standingSystemId } from "./standingTypes";
import {
  buildOrderDetail,
  buildOrderViews,
  buildPendingRoutes,
  buildStewardView,
} from "./standingViews";
import {
  appointSteward,
  checkStewardOffice,
  dismissSteward,
  requestStewardReview,
  setStewardBoard,
} from "./steward";

const registered = new WeakSet<GameEngine>();

const idSchema = z.number().int().min(1);
const noArgs = z.object({}).strict();
const orderArgs = z.object({ orderId: idSchema }).strict();
const scopeSchema = z.union([z.literal("settlement"), z.object({ zoneId: idSchema }).strict()]);

const createSchema = z
  .object({
    materialId: z.string().min(1).optional(),
    recipeId: z.string().min(1).optional(),
    targetQuantity: z.number().int(),
    restockThreshold: z.number().int().optional(),
    scope: scopeSchema.default("settlement"),
    priority: z.number().int().optional(),
    postingBoardId: idSchema.optional(),
  })
  .strict();

const updateSchema = z
  .object({
    orderId: idSchema,
    targetQuantity: z.number().int().optional(),
    restockThreshold: z.number().int().optional(),
    priority: z.number().int().optional(),
    postingBoardId: idSchema.nullable().optional(),
  })
  .strict();

// What a pending `undefined` means for exactOptionalPropertyTypes: leave the key out.
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

/**
 * Registers standing orders and the Steward with an engine (once per engine; the engine does it
 * for itself, after the status system). It adds:
 * - the root save section `stewardship` (orders, owned runs, the Steward, his board, the extra
 *   review request, the last review tick);
 * - the slot-14 system `standing`: every tick it prunes finished runs, vacates the office of a
 *   Steward who died or left the faction, runs the review at `stewardReviewTickOfDay` (or after
 *   `RequestStewardReview`) and rings the Bell Towers at `bellRingTicksOfDay`;
 * - the hooks into the Town Crier fleet: the delivery route to Notice Posts, what a delivered run
 *   does (a production order of one craft), and the rule that the Steward is no crier;
 * - the zone preference of storage routing (a restocking zone-scoped order steers its material
 *   into its zone, spec 026 FR-020);
 * - the task `govern.steward_audience` and the StandingOrder status provider;
 * - the commands `CreateStandingOrder`, `UpdateStandingOrder`, `PauseStandingOrder`,
 *   `ResumeStandingOrder`, `DeleteStandingOrder`, `AppointSteward`, `DismissSteward`,
 *   `SetStewardBoard` and `RequestStewardReview`;
 * - the queries `standing-orders {}`, `standing-order {orderId}` and `steward {}`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerStatus`.
 * @returns The engine's standing-order service.
 */
export function registerStanding(engine: GameEngine): StandingService {
  if (registered.has(engine)) {
    return getStandingService(engine);
  }
  registered.add(engine);
  const service = new StandingService();
  bindStandingService(engine, service);
  const crier = getCrierService(engine);
  crier.setRouter((boardId) => noticePostRoute(engine, boardId));
  crier.setRunApplier((runId) => applyRun(engine, runId));
  crier.setExclusion((entityId) => service.state.stewardEntityId === entityId);
  getStorageService(engine).setZonePreference((materialId) => preferredZone(engine, materialId));
  getStatusService(engine).registerProvider(standingProvider);
  engine.taskHandlers.register(createAudienceTask(engine));
  engine.registerSystem({
    id: standingSystemId,
    dependencies: [
      aiSystemId,
      factionsSystemId,
      jobsSystemId,
      crierSystemId,
      productionSystemId,
      storageSystemId,
      zonesSystemId,
    ],
    slot: TickSlot.StewardDay,
    saveSection: service.createSection(),
    run: (context) => {
      const state = service.state;
      pruneRuns(engine);
      dropFinishedOrders(engine);
      checkStewardOffice(engine);
      const extra =
        state.extraReviewAfterTick !== null && context.tick > state.extraReviewAfterTick;
      if (context.tickOfDay === engine.content.constants.stewardReviewTickOfDay || extra) {
        state.extraReviewAfterTick = null;
        runStewardReview(engine, context.tick);
      }
      ringBells(engine, context.tickOfDay);
    },
    commandHandlers: {
      CreateStandingOrder: defineCommand({
        schema: createSchema,
        handler: (payload, target) => {
          const order = createStandingOrder(
            target,
            defined({
              materialId: payload.materialId,
              recipeId: payload.recipeId,
              targetQuantity: payload.targetQuantity,
              restockThreshold: payload.restockThreshold,
              zoneId: payload.scope === "settlement" ? undefined : payload.scope.zoneId,
              priority: payload.priority,
              postingBoardId: payload.postingBoardId,
            }),
          );
          return { orderId: order.orderId };
        },
      }),
      UpdateStandingOrder: defineCommand({
        schema: updateSchema,
        handler: (payload, target) => {
          const { orderId, ...patch } = payload;
          updateStandingOrder(target, orderId, defined(patch));
          return { orderId };
        },
      }),
      PauseStandingOrder: defineCommand({
        schema: orderArgs,
        handler: (payload, target) => {
          setStandingOrderPaused(target, payload.orderId, true);
          return { orderId: payload.orderId };
        },
      }),
      ResumeStandingOrder: defineCommand({
        schema: orderArgs,
        handler: (payload, target) => {
          setStandingOrderPaused(target, payload.orderId, false);
          return { orderId: payload.orderId };
        },
      }),
      DeleteStandingOrder: defineCommand({
        schema: orderArgs,
        handler: (payload, target) => {
          deleteStandingOrder(target, payload.orderId);
          return { orderId: payload.orderId };
        },
      }),
      AppointSteward: defineCommand({
        schema: z.object({ entityId: idSchema }).strict(),
        handler: (payload, target) => ({ changed: appointSteward(target, payload.entityId) }),
      }),
      DismissSteward: defineCommand({
        schema: noArgs,
        handler: (_payload, target) => ({ changed: dismissSteward(target) }),
      }),
      SetStewardBoard: defineCommand({
        schema: z.object({ boardId: idSchema.nullable() }).strict(),
        handler: (payload, target) => {
          setStewardBoard(target, payload.boardId);
          return { boardId: payload.boardId };
        },
      }),
      RequestStewardReview: defineCommand({
        schema: noArgs,
        handler: (_payload, target) => {
          requestStewardReview(target);
          return { requested: true };
        },
      }),
    },
    queries: {
      "standing-orders": defineQuery({
        schema: noArgs,
        run: (_args, target) => buildOrderViews(target),
      }),
      "standing-order": defineQuery({
        schema: orderArgs,
        run: (args, target) => buildOrderDetail(target, args.orderId),
      }),
      steward: defineQuery({
        schema: noArgs,
        run: (_args, target) => buildStewardView(target),
      }),
      "pending-routes": defineQuery({
        schema: noArgs,
        run: (_args, target) => buildPendingRoutes(target),
      }),
    },
  });
  return service;
}
