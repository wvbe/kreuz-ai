import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { jobsSystemId } from "../jobs/jobTypes";
import { cancelBoardUpdate, queueBoardUpdate } from "./boardUpdates";
import { appointCrier, dismissCrier, loseCrierLoad } from "./crierFleet";
import { CrierService } from "./CrierService";
import { bindCrierService, getCrierService } from "./crierServiceRegistry";
import { BoardChangeKind, UpdateOrigin, crierSystemId } from "./crierTypes";
import { createDeliverTask } from "./createDeliverTask";
import { dispatchCriers, recoverCriers } from "./dispatchCriers";
import { townCrierComponent } from "./townCrierComponent";
import { buildCrierViews, buildPendingUpdateViews } from "./crierViews";

const registered = new WeakSet<GameEngine>();

const idSchema = z.number().int().min(1);

const postPayloadSchema = z
  .object({
    boardId: idSchema,
    jobTypeId: z.string().min(1),
    mapId: idSchema,
    cellIndex: z.number().int().min(0),
    entityId: idSchema.optional(),
    materialId: z.string().min(1).optional(),
    priority: z.number().int().min(0).max(100).optional(),
    urgent: z.boolean().optional(),
    wage: z.number().int().min(0).optional(),
  })
  .strict();

const removePayloadSchema = z.object({ boardId: idSchema, postingId: idSchema }).strict();

const modifyPayloadSchema = z
  .object({
    boardId: idSchema,
    postingId: idSchema,
    priority: z.number().int().min(0).max(100).optional(),
    wage: z.number().int().min(0).optional(),
  })
  .strict();

const entityPayloadSchema = z.object({ entityId: idSchema }).strict();

/**
 * Registers the Town Crier fleet with an engine (once per engine; the engine does it for itself,
 * so every game has it, after the job boards). It adds:
 * - the `TownCrier` component and the task type `towncrier.deliver`;
 * - the save section `systems.towncrier` (pending board updates and their id counter);
 * - a before-delete hook: a deleted crier loses what it carried (`jobboard.update.abandoned`),
 *   updates that were still waiting survive;
 * - the slot-7 system `towncrier`: `recoverCriers` then `dispatchCriers` every tick;
 * - the commands `PostJob`, `RemovePosting`, `ModifyPosting` (each queues a pending update on a
 *   user-managed board, applied when a crier arrives; `BoardNotUserManaged` on other boards),
 *   `CancelPendingBoardUpdate {updateId}`, `AppointTownCrier {entityId}` and
 *   `DismissTownCrier {entityId}`;
 * - the queries `pending-updates {}` and `town-criers {}`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerJobs`.
 * @returns The engine's crier service.
 */
export function registerCrier(engine: GameEngine): CrierService {
  if (registered.has(engine)) {
    return getCrierService(engine);
  }
  registered.add(engine);
  const service = new CrierService();
  bindCrierService(engine, service);
  engine.taskHandlers.register(createDeliverTask(engine));
  engine.store.addBeforeDeleteHook((entity) => {
    if (getComponent(entity, townCrierComponent) !== undefined) {
      loseCrierLoad(engine, entity.id);
    }
    return null;
  });
  engine.registerSystem({
    id: crierSystemId,
    dependencies: [aiSystemId, jobsSystemId],
    slot: TickSlot.JobBoards,
    components: [townCrierComponent],
    saveSection: service.createSection(),
    run: (context) => {
      recoverCriers(engine);
      dispatchCriers(engine, context.tick);
    },
    commandHandlers: {
      PostJob: defineCommand({
        schema: postPayloadSchema,
        handler: (payload, target) => ({
          updateId: queueBoardUpdate(
            target,
            payload.boardId,
            {
              kind: BoardChangeKind.Add,
              jobTypeId: payload.jobTypeId,
              mapId: payload.mapId,
              cellIndex: payload.cellIndex,
              entityId: payload.entityId ?? null,
              materialId: payload.materialId ?? null,
              priority: payload.priority ?? null,
              urgent: payload.urgent ?? false,
              wage: payload.wage ?? null,
            },
            UpdateOrigin.Player,
          ).updateId,
        }),
      }),
      RemovePosting: defineCommand({
        schema: removePayloadSchema,
        handler: (payload, target) => ({
          updateId: queueBoardUpdate(
            target,
            payload.boardId,
            { kind: BoardChangeKind.Remove, postingId: payload.postingId },
            UpdateOrigin.Player,
          ).updateId,
        }),
      }),
      ModifyPosting: defineCommand({
        schema: modifyPayloadSchema,
        handler: (payload, target) => ({
          updateId: queueBoardUpdate(
            target,
            payload.boardId,
            {
              kind: BoardChangeKind.Modify,
              postingId: payload.postingId,
              priority: payload.priority ?? null,
              wage: payload.wage ?? null,
            },
            UpdateOrigin.Player,
          ).updateId,
        }),
      }),
      CancelPendingBoardUpdate: defineCommand({
        schema: z.object({ updateId: idSchema }).strict(),
        handler: (payload, target) => {
          cancelBoardUpdate(target, payload.updateId);
          return { cancelled: true };
        },
      }),
      AppointTownCrier: defineCommand({
        schema: entityPayloadSchema,
        handler: (payload, target) => ({ changed: appointCrier(target, payload.entityId) }),
      }),
      DismissTownCrier: defineCommand({
        schema: entityPayloadSchema,
        handler: (payload, target) => ({ changed: dismissCrier(target, payload.entityId) }),
      }),
    },
    queries: {
      "pending-updates": defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) => buildPendingUpdateViews(target),
      }),
      "town-criers": defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) => buildCrierViews(target),
      }),
    },
  });
  return service;
}
