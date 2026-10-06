import { z } from "zod";
import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { NodeStatus } from "../behavior/behaviorTypes";
import type { BehaviorContext } from "../behavior/behaviorTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { transfer } from "../inventory/inventoryOperations";
import { canStore, getTotal } from "../inventory/inventoryQueries";
import { childCompleted } from "../jobs/jobExecutor";
import { approachFailedReason, jobTaskPriority } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { getStorageService } from "../storage/storageServiceRegistry";
import { canDepositInto } from "../storage/storageQueries";
import { childWait, doneStep, failStep, waitStep } from "../task/stepResults";
import type { StepResult, TaskContext, TaskHandler } from "../task/taskTypes";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { dwellingOf, dwellingStorage } from "./dwellingZones";
import { planFetch } from "./householdDemand";
import { fetchHouseholdGoodsId, fetchTaskType, householdNeedsGoodsId } from "./housingTypes";

/**
 * Failure reason when the source holds nothing the settler may take any more.
 */
export const sourceEmptyReason = "source_empty";

/**
 * Failure reason when the dwelling is gone or has no storage that takes the goods.
 */
export const noHouseholdStorageReason = "no_household_storage";

enum FetchPhase {
  ToSource = "to-source",
  ToDwelling = "to-dwelling",
}

const fetchDataSchema = z
  .object({
    dwellingId: z.number().int().min(1),
    materialId: z.string().min(1),
    quantity: z.number().int().min(1),
    sourceId: z.number().int().min(1),
  })
  .strict();

type FetchData = z.infer<typeof fetchDataSchema>;

function walk(context: TaskContext, phase: FetchPhase, mapId: number, cell: number): StepResult {
  context.task.phase = phase;
  return waitStep(childWait(context.spawnChild(AiTaskType.Move, moveTaskData(mapId, cell))));
}

function arriveAtSource(engine: GameEngine, context: TaskContext, data: FetchData): StepResult {
  const source = engine.store.get(data.sourceId);
  const available =
    source === undefined
      ? 0
      : getStorageService(engine).reservations.availableTo(
          data.sourceId,
          data.materialId,
          context.entityId,
        );
  const record = dwellingOf(engine, data.dwellingId);
  if (source === undefined || record === null) {
    return failStep(sourceEmptyReason);
  }
  const quantity = Math.min(
    data.quantity,
    available,
    canStore(engine.materials, context.entity, data.materialId, data.quantity).maxFittable,
  );
  if (quantity < 1) {
    return failStep(sourceEmptyReason);
  }
  transfer(
    { materials: engine.materials, actor: context.entityId, bus: engine.bus },
    source,
    context.entity,
    data.materialId,
    quantity,
  );
  return goHome(engine, context, data);
}

function goHome(engine: GameEngine, context: TaskContext, data: FetchData): StepResult {
  const record = dwellingOf(engine, data.dwellingId);
  const target = record === null ? undefined : dwellingStorage(engine, record.zone)[0];
  const place = target === undefined ? undefined : getComponent(target, positionComponent);
  const here = getComponent(context.entity, positionComponent);
  if (place === undefined || here === undefined) {
    return failStep(noHouseholdStorageReason);
  }
  if (place.cellIndex === here.cellIndex && place.mapId === here.mapId) {
    return deposit(engine, context, data);
  }
  return walk(context, FetchPhase.ToDwelling, place.mapId, place.cellIndex);
}

function deposit(engine: GameEngine, context: TaskContext, data: FetchData): StepResult {
  const record = dwellingOf(engine, data.dwellingId);
  if (record === null) {
    return failStep(noHouseholdStorageReason);
  }
  let held = getTotal(context.entity, data.materialId);
  for (const storage of dwellingStorage(engine, record.zone)) {
    if (held < 1) {
      break;
    }
    if (canDepositInto(engine, storage, data.materialId, context.entityId)) {
      const amount = Math.min(
        held,
        canStore(engine.materials, storage, data.materialId, held).maxFittable,
      );
      if (amount > 0) {
        transfer(
          { materials: engine.materials, actor: context.entityId, bus: engine.bus },
          context.entity,
          storage,
          data.materialId,
          amount,
        );
        held -= amount;
      }
    }
  }
  return held > 0 ? failStep(noHouseholdStorageReason) : doneStep();
}

/**
 * Builds the handler of the task `housing.fetch` (spec 029 FR-016): a resident walks to a source
 * storage (`sourceId`), takes what it may and can carry of the material (at most `quantity`, honouring
 * others' reservations; all or nothing for each transfer), walks to the dwelling's storage furniture
 * and deposits it there. Every step keeps the goods in the source or in the settler's inventory, so a
 * cancelled or failed fetch never loses or duplicates anything: goods the settler still carries
 * simply stay with it. Failure reasons: `source_empty`, `no_household_storage`,
 * `approach_failed`. All progress is in the task record, so a save resumes mid-fetch.
 *
 * @param engine - The engine.
 * @returns The task handler for type `housing.fetch`.
 */
export function createFetchTask(engine: GameEngine): TaskHandler {
  return {
    type: fetchTaskType,
    requires: ["Position", "Inventory"],
    start: (context, raw: JsonValue) => {
      const data = fetchDataSchema.parse(raw);
      const source = engine.store.get(data.sourceId);
      const place = source === undefined ? undefined : getComponent(source, positionComponent);
      const here = getComponent(context.entity, positionComponent);
      if (place === undefined || here === undefined) {
        return failStep(sourceEmptyReason);
      }
      if (place.mapId === here.mapId && place.cellIndex === here.cellIndex) {
        return arriveAtSource(engine, context, data);
      }
      return walk(context, FetchPhase.ToSource, place.mapId, place.cellIndex);
    },
    step: (context, record) => {
      if (!childCompleted(record)) {
        return failStep(approachFailedReason);
      }
      const data = fetchDataSchema.parse(record.data);
      return record.phase === FetchPhase.ToSource
        ? arriveAtSource(engine, context, data)
        : deposit(engine, context, data);
    },
    cancel: () => undefined,
  };
}

/**
 * The condition `household_needs_goods`: the settler has a home and a fetch is possible now (a
 * short group with an accessible source, nobody of the household fetching). A cheap check for the
 * behavior tree.
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when a fetch can start.
 */
export function householdNeedsGoods(engine: GameEngine, context: BehaviorContext): NodeStatus {
  return planFetch(engine, context.entity) === null ? NodeStatus.Failure : NodeStatus.Success;
}

/**
 * The action `fetch_household_goods` (spec 029 FR-016, spec 022 FR-014): a settler that holds no
 * claimed job (no task at job priority or above) and whose household is short of a demanded good
 * enqueues a `housing.fetch` task at job priority. It is a household chore: nothing is posted on
 * a job board. Fails (so the tree falls through to claiming and idling) when nothing can be
 * fetched.
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when a fetch was enqueued.
 */
export function fetchHouseholdGoods(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const queue = getComponent(context.entity, taskQueueComponent);
  if (queue === undefined || queue.tasks.some((task) => task.priority >= jobTaskPriority)) {
    return NodeStatus.Failure;
  }
  const plan = planFetch(engine, context.entity);
  if (plan === null || getComponent(context.entity, inventoryComponent) === undefined) {
    return NodeStatus.Failure;
  }
  engine.tasks.enqueue(context.entityId, {
    type: fetchTaskType,
    data: {
      dwellingId: plan.dwellingId,
      materialId: plan.materialId,
      quantity: plan.quantity,
      sourceId: plan.sourceId,
    },
    priority: jobTaskPriority,
  });
  return NodeStatus.Success;
}

/**
 * Registers the fetch task, the condition and the action that the `basic_needs` tree names.
 *
 * @param engine - The engine; call before the first `newGame` / `loadGame`.
 */
export function registerFetchHandlers(engine: GameEngine): void {
  engine.taskHandlers.register(createFetchTask(engine));
  engine.behaviorHandlers.registerCondition(householdNeedsGoodsId, (context) =>
    householdNeedsGoods(engine, context),
  );
  engine.behaviorHandlers.registerAction(fetchHouseholdGoodsId, (context) =>
    fetchHouseholdGoods(engine, context),
  );
}
