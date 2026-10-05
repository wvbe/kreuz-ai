import { z } from "zod";
import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { transfer } from "../inventory/inventoryOperations";
import { canStore, getTotal } from "../inventory/inventoryQueries";
import { childCompleted, registerJobType } from "../jobs/jobExecutor";
import type { ActiveJob, JobExecutor } from "../jobs/jobExecutor";
import { approachFailedReason, targetInvalidReason } from "../jobs/jobTypes";
import type { JobOutput } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { childWait, doneStep, failStep, waitStep } from "../task/stepResults";
import type { StepResult, TaskContext } from "../task/taskTypes";
import { canDepositInto } from "./storageQueries";
import { chooseRoute } from "./storageRouting";
import { getStorageService } from "./storageServiceRegistry";
import {
  haulJobId,
  maxHaulApproaches,
  maxHaulReroutes,
  noCapacityReason,
  noDestinationReason,
  ReservationKind,
  sourceGoneReason,
} from "./storageTypes";

enum HaulPhase {
  ToSource = "to-source",
  ToDestination = "to-destination",
}

const haulStateSchema = z
  .object({
    postingId: z.number().int().min(1),
    claimId: z.number().int().min(1),
    reservationId: z.number().int().min(1).nullable().default(null),
    carried: z.number().int().min(0).default(0),
    delivered: z.number().int().min(0).default(0),
    approaches: z.number().int().min(0).default(0),
    reroutes: z.number().int().min(0).default(0),
    destinationId: z.number().int().min(1).nullable().default(null),
    excluded: z.array(z.number().int().min(1)).default([]),
  })
  .strict();

type HaulState = z.infer<typeof haulStateSchema>;

function readState(data: JsonValue): HaulState {
  return haulStateSchema.parse(data);
}

function writeState(context: TaskContext, state: HaulState): void {
  context.task.data = { ...state };
}

function materialOf(job: ActiveJob): string | null {
  return job.posting.target.materialId;
}

function abort(engine: GameEngine, state: HaulState, reason: string): StepResult {
  if (state.reservationId !== null) {
    getStorageService(engine).reservations.release(state.reservationId);
  }
  return failStep(reason);
}

function walkTo(
  context: TaskContext,
  state: HaulState,
  phase: HaulPhase,
  mapId: number,
  cell: number,
): StepResult {
  context.task.phase = phase;
  writeState(context, state);
  return waitStep(childWait(context.spawnChild(AiTaskType.Move, moveTaskData(mapId, cell))));
}

function startDelivery(
  engine: GameEngine,
  context: TaskContext,
  state: HaulState,
  materialId: string,
): StepResult {
  const position = getComponent(context.entity, positionComponent);
  const held = Math.min(state.carried, getTotal(context.entity, materialId));
  if (position === undefined || held < 1) {
    writeState(context, state);
    return doneStep();
  }
  const route = chooseRoute(engine, {
    materialId,
    quantity: held,
    actorId: context.entityId,
    mapId: position.mapId,
    fromCell: position.cellIndex,
    excludeIds: state.excluded,
  });
  if (route === null) {
    // No storage takes the goods: the hauler holds them and the haul poster retries (D-26).
    state.destinationId = null;
    writeState(context, state);
    return doneStep();
  }
  state.destinationId = route.entityId;
  if (position.cellIndex === route.cellIndex) {
    return deposit(engine, context, state, materialId);
  }
  return walkTo(context, state, HaulPhase.ToDestination, route.mapId, route.cellIndex);
}

function deposit(
  engine: GameEngine,
  context: TaskContext,
  state: HaulState,
  materialId: string,
): StepResult {
  const destination: Entity | undefined =
    state.destinationId === null ? undefined : engine.store.get(state.destinationId);
  const held = Math.min(state.carried, getTotal(context.entity, materialId));
  if (held < 1) {
    // The goods are gone (eaten, expired): nothing left to deliver.
    writeState(context, state);
    return doneStep();
  }
  let amount = 0;
  if (
    destination !== undefined &&
    hasComponent(destination, inventoryComponent) &&
    canDepositInto(engine, destination, materialId, context.entityId)
  ) {
    amount = Math.min(held, canStore(engine.materials, destination, materialId, held).maxFittable);
  }
  if (destination !== undefined && amount > 0) {
    transfer(
      { materials: engine.materials, actor: context.entityId, bus: engine.bus },
      context.entity,
      destination,
      materialId,
      amount,
    );
    state.delivered += amount;
    state.carried -= amount;
  }
  if (held - amount < 1) {
    writeState(context, state);
    return doneStep();
  }
  if (state.destinationId !== null) {
    state.excluded.push(state.destinationId);
  }
  state.reroutes += 1;
  if (state.reroutes > maxHaulReroutes) {
    writeState(context, state);
    return doneStep();
  }
  return startDelivery(engine, context, state, materialId);
}

function approachSource(
  engine: GameEngine,
  context: TaskContext,
  state: HaulState,
  job: ActiveJob,
  materialId: string,
): StepResult {
  const sourceId = job.posting.target.entityId;
  const source = sourceId === null ? undefined : engine.store.get(sourceId);
  const place = source === undefined ? undefined : getComponent(source, positionComponent);
  const here = getComponent(context.entity, positionComponent);
  if (
    source === undefined ||
    place === undefined ||
    here === undefined ||
    place.mapId !== here.mapId
  ) {
    return abort(engine, state, sourceGoneReason);
  }
  if (place.cellIndex !== here.cellIndex) {
    state.approaches += 1;
    if (state.approaches > maxHaulApproaches) {
      return abort(engine, state, approachFailedReason);
    }
    return walkTo(context, state, HaulPhase.ToSource, place.mapId, place.cellIndex);
  }
  if (state.reservationId === null) {
    return abort(engine, state, sourceGoneReason);
  }
  try {
    const moved = getStorageService(engine).reservations.commit(
      state.reservationId,
      context.entity,
    );
    state.reservationId = null;
    state.carried = moved.quantity;
  } catch {
    // Nothing moved (the stock changed or the reservation was dropped): all or nothing.
    return abort(engine, state, sourceGoneReason);
  }
  return startDelivery(engine, context, state, materialId);
}

function begin(engine: GameEngine, context: TaskContext, job: ActiveJob): StepResult {
  const materialId = materialOf(job);
  const sourceId = job.posting.target.entityId;
  const source = sourceId === null ? undefined : engine.store.get(sourceId);
  const state = readState(context.task.data);
  if (materialId === null || source === undefined || !hasComponent(source, inventoryComponent)) {
    return failStep(targetInvalidReason);
  }
  if (source.id === context.entityId) {
    state.carried = getTotal(source, materialId);
    return state.carried < 1
      ? failStep(targetInvalidReason)
      : startDelivery(engine, context, state, materialId);
  }
  const reservations = getStorageService(engine).reservations;
  const available = reservations.availableTo(source.id, materialId, context.entityId);
  if (available < 1) {
    return failStep(targetInvalidReason);
  }
  const quantity = Math.min(
    available,
    canStore(engine.materials, context.entity, materialId, available).maxFittable,
  );
  const position = getComponent(context.entity, positionComponent);
  if (quantity < 1) {
    return failStep(noCapacityReason);
  }
  if (
    position === undefined ||
    chooseRoute(engine, {
      materialId,
      quantity,
      actorId: context.entityId,
      mapId: position.mapId,
      fromCell: position.cellIndex,
    }) === null
  ) {
    return failStep(noDestinationReason);
  }
  state.reservationId = reservations.reserve({
    kind: ReservationKind.Haul,
    holderId: context.entityId,
    inventoryOwnerId: source.id,
    materialId,
    quantity,
  }).id;
  return approachSource(engine, context, state, job, materialId);
}

/**
 * Builds the executor of `haul.deliver` (spec 018, plan 3.2). A claimed posting names a source
 * entity (`target.entityId`: a loose pile, a storage, a citizen holding goods) and a material
 * (`target.materialId`); the hauler:
 * 1. takes what it can carry of the source's unreserved stock under a `Haul` reservation (a
 *    hauler that is its own source skips this step and delivers what it carries);
 * 2. walks to the source (phase `to-source`, re-targeting a source that moved, at most 5 times)
 *    and moves the reserved goods into its own inventory with `commit`;
 * 3. picks the best storage (`chooseRoute`), walks there (phase `to-destination`) and deposits as
 *    much as fits; a full or refusing storage is excluded and the next best is tried (at most 3
 *    times). Goods nothing accepts stay with the hauler, the job still completes and the haul
 *    poster posts them again (and reports `storage.no-compatible-destination` once).
 *
 * Interrupt safety: every step keeps the goods either in the source, under a reservation, or in
 * the hauler's inventory, so nothing is duplicated or lost. A cancelled or failed task releases
 * its reservation; goods already picked up remain with the hauler and are hauled again later.
 * Failure reasons: `target_invalid`, `no_capacity`, `no_destination`, `source_gone`,
 * `approach_failed`. All progress is in the task record, so a save resumes mid-haul.
 *
 * @param engine - The engine.
 * @returns An executor for `registerJobType`.
 */
export function createHaulExecutor(engine: GameEngine): JobExecutor {
  return {
    requires: ["Position", "Inventory"],
    start: (context, job) => begin(engine, context, job),
    step: (context, record, job) => {
      const materialId = materialOf(job);
      const state = readState(record.data);
      if (materialId === null) {
        return abort(engine, state, targetInvalidReason);
      }
      if (!childCompleted(record)) {
        return abort(engine, state, approachFailedReason);
      }
      return record.phase === HaulPhase.ToSource
        ? approachSource(engine, context, state, job, materialId)
        : deposit(engine, context, state, materialId);
    },
    complete: (context, job): JobOutput[] => {
      const materialId = materialOf(job);
      const delivered = readState(context.task.data).delivered;
      return materialId === null || delivered < 1 ? [] : [{ materialId, quantity: delivered }];
    },
    cancel: (_context, record) => {
      const state = readState(record.data);
      if (state.reservationId !== null) {
        getStorageService(engine).reservations.release(state.reservationId);
      }
    },
  };
}

/**
 * Registers the executor of `haul.deliver` with the engine's task handlers (see
 * {@link createHaulExecutor}).
 *
 * @param engine - The engine.
 */
export function registerHauling(engine: GameEngine): void {
  registerJobType(engine, haulJobId, createHaulExecutor(engine));
}
