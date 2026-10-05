import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getStorageService } from "../storage/storageServiceRegistry";
import { playerCancelToken } from "../task/TaskSystem";
import type { CancelToken } from "../task/taskTypes";
import { craftingInterruptedEvent, craftJobId } from "./productionTypes";
import type { CraftingEnded, WorkstationData } from "./productionTypes";

/**
 * Interrupts the craft in progress at a workstation (DECISIONS D-10, spec 014 FR-013a): the locked
 * inputs are released (they never left the workstation inventory, so "returned" means claimable
 * again), nothing is consumed, progress is gone and `production.crafting.interrupted` is queued.
 * Does nothing when the workstation is not crafting.
 *
 * @param engine - The engine.
 * @param station - The workstation entity.
 * @param data - Its `ProductionOrders` data.
 * @param reason - Why the craft stopped (a cancel reason or `crafter_lost`).
 * @returns True when a craft was interrupted.
 */
export function interruptCraft(
  engine: GameEngine,
  station: Entity,
  data: WorkstationData,
  reason: string,
): boolean {
  const craft = data.craft;
  if (craft === null) {
    return false;
  }
  const reservations = getStorageService(engine).reservations;
  for (const reservationId of craft.reservationIds) {
    reservations.release(reservationId);
  }
  data.craft = null;
  const payload: CraftingEnded = {
    workstationId: station.id,
    crafterId: craft.crafterId,
    recipeId: craft.recipeId,
    reason,
  };
  engine.bus.emit(craftingInterruptedEvent, payload);
  return true;
}

/**
 * Cancels the `craft.produce` task of a crafter that works on a posting. The task's cancel hook
 * gives back what it holds (locks, carried inputs) and the claim goes back to the board.
 *
 * @param engine - The engine.
 * @param crafterId - The claimant.
 * @param postingId - The posting of the craft.
 * @param token - Why it is cancelled (default: the player).
 * @returns True when a matching task was found and cancelled.
 */
export function cancelCraftTask(
  engine: GameEngine,
  crafterId: EntityId,
  postingId: number,
  token: CancelToken = playerCancelToken,
): boolean {
  const task = engine.tasks
    .getQueue(crafterId)
    ?.tasks.find(
      (candidate) =>
        candidate.type === craftJobId &&
        typeof candidate.data === "object" &&
        candidate.data !== null &&
        !Array.isArray(candidate.data) &&
        candidate.data["postingId"] === postingId,
    );
  if (task === undefined) {
    return false;
  }
  engine.tasks.cancel(crafterId, task.id, token);
  return true;
}
