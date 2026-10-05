import { z } from "zod";
import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import type { RecipeContent } from "../content/schemas/economySchemas";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { InventoryError } from "../inventory/InventoryError";
import { storeUpTo, transfer } from "../inventory/inventoryOperations";
import { canStore, getTotal } from "../inventory/inventoryQueries";
import { childCompleted, registerJobType } from "../jobs/jobExecutor";
import type { ActiveJob, JobExecutor } from "../jobs/jobExecutor";
import { findPosting } from "../jobs/jobBoards";
import { approachFailedReason, targetInvalidReason } from "../jobs/jobTypes";
import type { JobOutput } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { skillOutputStreamName } from "../skills/skillTypes";
import { emitSkillWorkCompleted } from "../skills/skillGrowth";
import { rollOutputBonus } from "../skills/outputBonus";
import { workDuration } from "../skills/workSpeed";
import { findSources } from "../storage/storageQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import {
  childWait,
  continueStep,
  doneStep,
  failStep,
  tickWait,
  waitStep,
} from "../task/stepResults";
import type { StepResult, TaskContext } from "../task/taskTypes";
import { interruptCraft } from "./craftCleanup";
import { firstOutputMisfit } from "./firstOutputMisfit";
import { orderBlockers } from "./productionBlockers";
import { productionOrdersComponent } from "./productionOrdersComponent";
import { pruneFinishedOrders } from "./productionOrders";
import { listWorkstations } from "./productionQueries";
import {
  craftBlockedReason,
  craftingCompletedEvent,
  craftingStartedEvent,
  craftJobId,
  missingInputReason,
  noCapacityReason,
  OrderStatus,
  orderCompletedEvent,
  outputBlockedEvent,
  outputRetryTicks,
  ProductionBlockedKind,
} from "./productionTypes";
import type {
  CraftingCompleted,
  CraftingStarted,
  CraftItem,
  OrderEvent,
  OutputBlocked,
  ProductionOrder,
  WorkstationData,
} from "./productionTypes";

enum CraftPhase {
  ToSource = "to-source",
  ToStation = "to-station",
  Craft = "craft",
  Blocked = "blocked",
}

const itemSchema = z
  .object({ materialId: z.string().min(1), quantity: z.number().int().min(1) })
  .strict();

const craftStateSchema = z
  .object({
    postingId: z.number().int().min(1),
    claimId: z.number().int().min(1),
    trips: z
      .array(
        z
          .object({
            sourceId: z.number().int().min(1),
            materialId: z.string().min(1),
            quantity: z.number().int().min(1),
          })
          .strict(),
      )
      .default([]),
    tripIndex: z.number().int().min(0).default(0),
    carried: z.array(itemSchema).default([]),
    reported: z.boolean().default(false),
  })
  .strict();

type CraftState = z.infer<typeof craftStateSchema>;

type CraftJob = {
  station: Entity;
  data: WorkstationData;
  order: ProductionOrder;
  recipe: RecipeContent;
};

function readState(data: JsonValue): CraftState {
  return craftStateSchema.parse(data);
}

function writeState(context: TaskContext, state: CraftState): void {
  context.task.data = { ...state };
}

function resolveCraft(engine: GameEngine, job: ActiveJob): CraftJob | null {
  const stationId = job.posting.target.entityId;
  const station = stationId === null ? undefined : engine.store.get(stationId);
  const data = station === undefined ? undefined : getComponent(station, productionOrdersComponent);
  const order = data?.orders.find((candidate) => candidate.postingId === job.posting.id);
  const recipe = order === undefined ? undefined : engine.content.recipes.find(order.recipeId);
  return station === undefined || data === undefined || order === undefined || recipe === undefined
    ? null
    : { station, data, order, recipe };
}

/**
 * What a craft needs at the workstation: the inputs (consumed) and the tools (one unit each, kept).
 *
 * @param recipe - The recipe.
 * @returns One entry per input and tool with the reservation kind that protects it.
 */
function needs(recipe: RecipeContent): { item: CraftItem; kind: ReservationKind }[] {
  return [
    ...recipe.inputs.map((item) => ({ item, kind: ReservationKind.Lock })),
    ...recipe.toolMaterialIds.map((materialId) => ({
      item: { materialId, quantity: 1 },
      kind: ReservationKind.Tool,
    })),
  ];
}

/**
 * Hands what the crafter carries back to the workstation (best effort: what does not fit stays
 * with the crafter).
 *
 * @param engine - The engine.
 * @param crafter - The crafter entity.
 * @param station - The workstation, or undefined when it is gone (nothing is handed back).
 * @param state - The task state (its `carried` list is emptied).
 */
function returnCarried(
  engine: GameEngine,
  crafter: Entity,
  station: Entity | undefined,
  state: CraftState,
): void {
  if (station === undefined || getComponent(station, inventoryComponent) === undefined) {
    return;
  }
  for (const item of state.carried) {
    const held = Math.min(item.quantity, getTotal(crafter, item.materialId));
    if (held < 1) {
      continue;
    }
    try {
      transfer(
        { materials: engine.materials, actor: crafter.id, bus: engine.bus },
        crafter,
        station,
        item.materialId,
        held,
      );
    } catch (thrown) {
      if (!(thrown instanceof InventoryError)) {
        throw thrown;
      }
    }
  }
  state.carried = [];
}

function abort(
  engine: GameEngine,
  context: TaskContext,
  state: CraftState,
  station: Entity | undefined,
  reason: string,
): StepResult {
  returnCarried(engine, context.entity, station, state);
  return failStep(reason);
}

function walkTo(
  context: TaskContext,
  state: CraftState,
  phase: CraftPhase,
  mapId: number,
  cell: number,
): StepResult {
  context.task.phase = phase;
  writeState(context, state);
  return waitStep(childWait(context.spawnChild(AiTaskType.Move, moveTaskData(mapId, cell))));
}

function startCraft(
  engine: GameEngine,
  context: TaskContext,
  state: CraftState,
  job: ActiveJob,
  found: CraftJob,
): StepResult {
  const reservations = getStorageService(engine).reservations;
  const wanted = needs(found.recipe);
  for (const { item } of wanted) {
    if (
      reservations.availableTo(found.station.id, item.materialId, context.entityId) < item.quantity
    ) {
      return abort(engine, context, state, found.station, missingInputReason);
    }
  }
  if (found.data.craft !== null) {
    return abort(engine, context, state, found.station, craftBlockedReason);
  }
  const reservationIds: number[] = [];
  for (const { item, kind } of wanted) {
    reservationIds.push(
      reservations.reserve({
        kind,
        holderId: context.entityId,
        inventoryOwnerId: found.station.id,
        materialId: item.materialId,
        quantity: item.quantity,
      }).id,
    );
  }
  const durationTicks = workDuration(
    engine.content,
    context.entity,
    found.recipe,
    found.recipe.durationTicks,
  );
  found.data.craft = {
    orderId: found.order.orderId,
    crafterId: context.entityId,
    postingId: job.posting.id,
    recipeId: found.recipe.id,
    startedTick: context.tick,
    durationTicks,
    reservationIds,
  };
  const payload: CraftingStarted = {
    workstationId: found.station.id,
    crafterId: context.entityId,
    recipeId: found.recipe.id,
  };
  engine.bus.emit(craftingStartedEvent, payload);
  context.task.phase = CraftPhase.Craft;
  writeState(context, state);
  return waitStep(tickWait(context.tick + durationTicks));
}

function deposit(
  engine: GameEngine,
  context: TaskContext,
  state: CraftState,
  job: ActiveJob,
  found: CraftJob,
): StepResult {
  for (const item of state.carried) {
    const held = Math.min(item.quantity, getTotal(context.entity, item.materialId));
    if (held < 1) {
      continue;
    }
    try {
      transfer(
        { materials: engine.materials, actor: context.entityId, bus: engine.bus },
        context.entity,
        found.station,
        item.materialId,
        held,
      );
    } catch (thrown) {
      if (!(thrown instanceof InventoryError)) {
        throw thrown;
      }
      return abort(engine, context, state, found.station, noCapacityReason);
    }
  }
  state.carried = [];
  return startCraft(engine, context, state, job, found);
}

function goToStation(
  engine: GameEngine,
  context: TaskContext,
  state: CraftState,
  job: ActiveJob,
  found: CraftJob,
): StepResult {
  const here = getComponent(context.entity, positionComponent);
  const place = getComponent(found.station, positionComponent);
  if (here === undefined || place === undefined || here.mapId !== place.mapId) {
    return abort(engine, context, state, found.station, craftBlockedReason);
  }
  return here.cellIndex === place.cellIndex
    ? deposit(engine, context, state, job, found)
    : walkTo(context, state, CraftPhase.ToStation, place.mapId, place.cellIndex);
}

function nextTrip(
  engine: GameEngine,
  context: TaskContext,
  state: CraftState,
  job: ActiveJob,
  found: CraftJob,
): StepResult {
  const trip = state.trips[state.tripIndex];
  if (trip === undefined) {
    return goToStation(engine, context, state, job, found);
  }
  const source = engine.store.get(trip.sourceId);
  const place = source === undefined ? undefined : getComponent(source, positionComponent);
  const here = getComponent(context.entity, positionComponent);
  if (
    source === undefined ||
    place === undefined ||
    here === undefined ||
    place.mapId !== here.mapId
  ) {
    return abort(engine, context, state, found.station, missingInputReason);
  }
  return place.cellIndex === here.cellIndex
    ? pickUp(engine, context, state, job, found)
    : walkTo(context, state, CraftPhase.ToSource, place.mapId, place.cellIndex);
}

function pickUp(
  engine: GameEngine,
  context: TaskContext,
  state: CraftState,
  job: ActiveJob,
  found: CraftJob,
): StepResult {
  const trip = state.trips[state.tripIndex];
  const source = trip === undefined ? undefined : engine.store.get(trip.sourceId);
  if (trip === undefined || source === undefined) {
    return abort(engine, context, state, found.station, missingInputReason);
  }
  const amount = Math.min(
    trip.quantity,
    getStorageService(engine).reservations.availableTo(
      source.id,
      trip.materialId,
      context.entityId,
    ),
    getTotal(source, trip.materialId),
  );
  if (amount < trip.quantity) {
    // Somebody else took the stock on the way: all or nothing, the poster looks again later.
    return abort(engine, context, state, found.station, missingInputReason);
  }
  try {
    transfer(
      { materials: engine.materials, actor: context.entityId, bus: engine.bus },
      source,
      context.entity,
      trip.materialId,
      amount,
    );
  } catch (thrown) {
    if (!(thrown instanceof InventoryError)) {
      throw thrown;
    }
    return abort(engine, context, state, found.station, noCapacityReason);
  }
  const held = state.carried.find((item) => item.materialId === trip.materialId);
  if (held === undefined) {
    state.carried.push({ materialId: trip.materialId, quantity: amount });
  } else {
    held.quantity += amount;
  }
  state.tripIndex += 1;
  return nextTrip(engine, context, state, job, found);
}

function begin(engine: GameEngine, context: TaskContext, job: ActiveJob): StepResult {
  const state = readState(context.task.data);
  const found = resolveCraft(engine, job);
  if (found === null) {
    return failStep(targetInvalidReason);
  }
  if (found.order.status !== OrderStatus.Active || found.data.craft !== null) {
    return failStep(craftBlockedReason);
  }
  const blockers = orderBlockers(engine, found.station, found.order);
  const blocker = blockers[0];
  if (blocker !== undefined) {
    return failStep(
      blocker.kind === ProductionBlockedKind.MissingInput ||
        blocker.kind === ProductionBlockedKind.MissingTool
        ? missingInputReason
        : craftBlockedReason,
    );
  }
  const reservations = getStorageService(engine).reservations;
  const carriedTotals = new Map<string, number>();
  for (const { item } of needs(found.recipe)) {
    const short =
      item.quantity - reservations.availableTo(found.station.id, item.materialId, context.entityId);
    if (short < 1) {
      continue;
    }
    const sources = findSources(engine, context.entity, item.materialId, short);
    if (sources.reduce((sum, source) => sum + source.quantity, 0) < short) {
      return failStep(missingInputReason);
    }
    carriedTotals.set(item.materialId, (carriedTotals.get(item.materialId) ?? 0) + short);
    for (const source of sources) {
      state.trips.push({
        sourceId: source.entityId,
        materialId: item.materialId,
        quantity: source.quantity,
      });
    }
  }
  for (const [materialId, quantity] of carriedTotals) {
    if (!canStore(engine.materials, context.entity, materialId, quantity).fits) {
      return failStep(noCapacityReason);
    }
  }
  return nextTrip(engine, context, state, job, found);
}

function tryFinish(
  engine: GameEngine,
  context: TaskContext,
  state: CraftState,
  found: CraftJob,
): StepResult {
  const misfit = firstOutputMisfit(
    engine,
    found.station,
    found.recipe.inputs,
    found.recipe.outputs,
  );
  if (misfit === null) {
    return doneStep();
  }
  if (!state.reported) {
    state.reported = true;
    const payload: OutputBlocked = {
      workstationId: found.station.id,
      crafterId: context.entityId,
      materialId: misfit,
    };
    engine.bus.emit(outputBlockedEvent, payload);
  }
  context.task.phase = CraftPhase.Blocked;
  writeState(context, state);
  return waitStep(tickWait(context.tick + outputRetryTicks));
}

function completeCraft(
  engine: GameEngine,
  context: TaskContext,
  found: CraftJob,
): JobOutput[] | null {
  const craft = found.data.craft;
  if (craft === null || craft.crafterId !== context.entityId) {
    return null;
  }
  const reservations = getStorageService(engine).reservations;
  const wanted = needs(found.recipe);
  const intact = wanted.every(({ item, kind }, index) => {
    const reservation = reservations.get(craft.reservationIds[index] ?? 0);
    return (
      reservation !== null &&
      reservation.kind === kind &&
      reservation.materialId === item.materialId &&
      reservation.quantity === item.quantity
    );
  });
  if (!intact || craft.reservationIds.length !== wanted.length) {
    interruptCraft(engine, found.station, found.data, craftBlockedReason);
    return null;
  }
  const inputs: CraftItem[] = [];
  for (const [index, { item, kind }] of wanted.entries()) {
    const id = craft.reservationIds[index] ?? 0;
    if (kind === ReservationKind.Lock) {
      reservations.commit(id, null);
      inputs.push({ ...item });
    } else {
      reservations.release(id);
    }
  }
  const outputs: CraftItem[] = found.recipe.outputs.map((item) => ({ ...item }));
  const bonus = rollOutputBonus(
    engine.content,
    context.entity,
    found.recipe,
    engine.prng.stream(skillOutputStreamName),
  );
  const storeContext = { materials: engine.materials, actor: null, bus: engine.bus };
  const placed: CraftItem[] = [];
  for (const [index, item] of outputs.entries()) {
    const extra = index === 0 ? bonus : 0;
    const base = storeUpTo(storeContext, found.station, item.materialId, item.quantity);
    const more = extra > 0 ? storeUpTo(storeContext, found.station, item.materialId, extra) : null;
    const quantity = base.stored + (more?.stored ?? 0);
    if (quantity > 0) {
      placed.push({ materialId: item.materialId, quantity });
    }
  }
  found.data.craft = null;
  found.order.postingId = null;
  found.order.remaining = Math.max(0, found.order.remaining - 1);
  const orderEvent: OrderEvent = {
    orderId: found.order.orderId,
    workstationId: found.station.id,
    recipeId: found.recipe.id,
  };
  if (found.order.status === OrderStatus.Active && found.order.remaining === 0) {
    found.order.status = OrderStatus.Completed;
  }
  const completed: CraftingCompleted = {
    workstationId: found.station.id,
    crafterId: context.entityId,
    recipeId: found.recipe.id,
    inputs,
    outputs: placed,
  };
  engine.bus.emit(craftingCompletedEvent, completed);
  if (found.order.status === OrderStatus.Completed) {
    engine.bus.emit(orderCompletedEvent, orderEvent);
  }
  pruneFinishedOrders(found.data);
  if (found.recipe.skillId !== null) {
    emitSkillWorkCompleted(engine.bus, context.entityId, found.recipe.skillId);
  }
  return placed;
}

/**
 * Builds the executor of `craft.produce` (spec 014, DECISIONS D-09, D-10, plan 3.3). A claimed
 * posting names a workstation (`target.entityId`); its order (the one whose `postingId` is the
 * posting) names the recipe. One claim is one craft. The crafter:
 * 1. checks the blockers again and plans trips: what the workstation inventory lacks of the
 *    inputs (and one unit of each tool) is fetched from claimable storage (`findSources`, nearest
 *    first); a lack that cannot be covered fails with `missing_input`;
 * 2. walks to each source (phase `to-source`) and moves the goods into its own inventory, all or
 *    nothing per source (the stock may have been taken on the way: `missing_input`);
 * 3. walks to the workstation (phase `to-station`) and deposits what it carries into the work
 *    inventory;
 * 4. locks the inputs (`Lock`) and tools (`Tool`) on the workstation inventory, fixes the duration
 *    with `workDuration` and waits that many ticks (phase `craft`, a serialized tick wait, so a
 *    save resumes exactly); `production.crafting.started`;
 * 5. when the time is over and the outputs fit (inputs leaving first), consumes the locks,
 *    places the outputs in the workstation inventory plus the skill output bonus (units that do
 *    not fit are not made), counts the order down and emits `production.crafting.completed` and
 *    `skill.work.completed`. Outputs that do not fit wait (phase `blocked`, retried every 6 ticks,
 *    `production.output.blocked` once).
 *
 * Interrupt safety: goods are in the source, in the crafter's inventory (and the task record), in
 * the work inventory or under a lock. A cancelled task releases its locks, hands carried inputs
 * back to the workstation and queues `production.crafting.interrupted`; the claim goes back to the
 * board. Failure reasons: `target_invalid`, `craft_blocked`, `missing_input`, `no_capacity`,
 * `approach_failed`.
 *
 * @param engine - The engine.
 * @returns An executor for `registerJobType`.
 */
export function createCraftExecutor(engine: GameEngine): JobExecutor {
  return {
    requires: ["Position", "Inventory"],
    start: (context, job) => begin(engine, context, job),
    step: (context, record, job) => {
      const state = readState(record.data);
      const found = resolveCraft(engine, job);
      if (found === null) {
        return abort(engine, context, state, undefined, targetInvalidReason);
      }
      switch (record.phase) {
        case CraftPhase.ToSource:
          return childCompleted(record)
            ? pickUp(engine, context, state, job, found)
            : abort(engine, context, state, found.station, approachFailedReason);
        case CraftPhase.ToStation:
          return childCompleted(record)
            ? deposit(engine, context, state, job, found)
            : abort(engine, context, state, found.station, approachFailedReason);
        default:
          return record.wake === null ? continueStep() : tryFinish(engine, context, state, found);
      }
    },
    complete: (context, job) => {
      const found = resolveCraft(engine, job);
      return found === null ? null : completeCraft(engine, context, found);
    },
    cancel: (context, record, token) => {
      const state = readState(record.data);
      let station: Entity | undefined;
      for (const candidate of listWorkstations(engine)) {
        const data = getComponent(candidate, productionOrdersComponent);
        if (data?.craft?.crafterId === context.entityId) {
          interruptCraft(engine, candidate, data, token.reason);
          station = candidate;
        }
      }
      if (station === undefined) {
        const stationId = findPosting(engine, state.postingId)?.posting.target.entityId ?? null;
        station = stationId === null ? undefined : engine.store.get(stationId);
      }
      returnCarried(engine, context.entity, station, state);
    },
  };
}

/**
 * Registers the executor of `craft.produce` with the engine's task handlers (see
 * {@link createCraftExecutor}).
 *
 * @param engine - The engine.
 */
export function registerCrafting(engine: GameEngine): void {
  registerJobType(engine, craftJobId, createCraftExecutor(engine));
}
