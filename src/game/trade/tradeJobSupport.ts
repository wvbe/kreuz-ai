import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getBalance } from "../inventory/inventoryMoney";
import { getTotal } from "../inventory/inventoryQueries";
import type { ActiveJob } from "../jobs/jobExecutor";
import { activePostingsOfType } from "../jobs/jobBoards";
import { positionComponent } from "../map/positionComponent";
import { nearestRunningBoard, postHaulJob } from "../storage/haulPoster";
import { haulJobId } from "../storage/storageTypes";
import { childWait, waitStep } from "../task/stepResults";
import type { StepResult, TaskContext } from "../task/taskTypes";
import { getTradeService } from "./tradeServiceRegistry";
import { TraderPhase } from "./tradeTypes";
import type { TradeOrder } from "./tradeTypes";
import { traderComponent } from "./traderComponent";
import { depositToTreasury } from "./treasury";

/**
 * The order a claimed trade job works for (the order remembers the posting it posted).
 *
 * @param engine - The engine.
 * @param job - The claimed job.
 * @returns A copy of the order, or null when it is gone or closed.
 */
export function orderOfJob(engine: GameEngine, job: ActiveJob): TradeOrder | null {
  return getTradeService(engine).orderOfPosting(job.posting.id);
}

/**
 * The trader entity a job targets, if it is still at the market.
 *
 * @param engine - The engine.
 * @param job - The claimed job.
 * @returns The entity, or null when the caravan left or is not open for trade.
 */
export function traderOfJob(engine: GameEngine, job: ActiveJob): Entity | null {
  const id = job.posting.target.entityId;
  const entity = id === null ? undefined : engine.store.get(id);
  return entity !== undefined &&
    !engine.store.isPendingDelete(entity.id) &&
    getComponent(entity, traderComponent)?.phase === TraderPhase.Present
    ? entity
    : null;
}

/**
 * Starts a walk as a `move` child of the task and waits for it.
 *
 * @param context - The task context.
 * @param phase - The phase label to store on the task.
 * @param mapId - Map of the goal.
 * @param cell - Goal cell.
 * @returns The wait step.
 */
export function walkTo(
  context: TaskContext,
  phase: string,
  mapId: number,
  cell: number,
): StepResult {
  context.task.phase = phase;
  return waitStep(childWait(context.spawnChild(AiTaskType.Move, moveTaskData(mapId, cell))));
}

/**
 * Where an entity stands.
 *
 * @param entity - The entity.
 * @returns Map and cell, or null when it has no position.
 */
export function placeOf(entity: Entity): { mapId: number; cellIndex: number } | null {
  const place = getComponent(entity, positionComponent);
  return place === undefined ? null : { mapId: place.mapId, cellIndex: place.cellIndex };
}

/**
 * Asks for a `haul.deliver` job that takes the goods a worker carries home (a purchase from a
 * trader, goods left over after a failed sale). Nothing is posted when the worker holds none, when
 * a haul job for the same goods is already active or when no board runs.
 *
 * @param engine - The engine.
 * @param worker - The carrying entity.
 * @param materialId - The material.
 * @param tick - The current tick.
 */
export function postDeliveryHaul(
  engine: GameEngine,
  worker: Entity,
  materialId: string,
  tick: number,
): void {
  const boardId = nearestRunningBoard(engine, worker);
  const active = activePostingsOfType(engine, haulJobId).some(
    (posting) => posting.target.entityId === worker.id && posting.target.materialId === materialId,
  );
  if (boardId !== null && !active && getTotal(worker, materialId) > 0) {
    postHaulJob(engine, boardId, worker.id, materialId, tick);
  }
}

/**
 * Brings coins a worker still carries from a trip back to the treasury (what a sale earned, what
 * a purchase left over). A worker carries its own wages too, so only the stated amount, capped by
 * what it holds, goes back.
 *
 * @param engine - The engine.
 * @param worker - The worker entity.
 * @param amount - Coins to hand in.
 * @returns The coins handed in.
 */
export function handInCoins(engine: GameEngine, worker: Entity, amount: number): number {
  const held = getBalance({ materials: engine.materials, actor: null }, worker);
  const coins = Math.min(amount, held);
  return coins >= 1 && depositToTreasury(engine, worker.id, coins) ? coins : 0;
}
