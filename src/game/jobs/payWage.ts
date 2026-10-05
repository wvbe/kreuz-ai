import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { credit } from "../inventory/inventoryMoney";
import { InventoryError } from "../inventory/InventoryError";
import { getJobService } from "./jobServiceRegistry";
import type { JobPosting } from "./jobTypes";

/**
 * Pays the wage of a completed posting to the worker (DECISIONS D-08): wage 0 transfers nothing.
 * A payer set on the job service (the treasury of 4.1) takes over; without one the coins are
 * minted into the worker's inventory, because only the player government has a treasury and none
 * exists yet. A full inventory leaves the wage unpaid and adds a warning to the engine.
 *
 * @param engine - The engine.
 * @param workerId - The paid entity.
 * @param posting - The completed posting (carries the wage and the poster).
 * @returns True when coins reached the worker or a custom payer took the payment.
 */
export function payWage(engine: GameEngine, workerId: EntityId, posting: JobPosting): boolean {
  if (posting.wage <= 0) {
    return true;
  }
  const custom = getJobService(engine).wagePayer();
  if (custom !== null) {
    custom(engine, workerId, posting.wage, posting);
    return true;
  }
  const worker = engine.store.get(workerId);
  if (worker === undefined) {
    return false;
  }
  try {
    credit({ materials: engine.materials, actor: null, bus: engine.bus }, worker, posting.wage);
    return true;
  } catch (failure) {
    if (failure instanceof InventoryError) {
      engine.warnings.push(
        `wage of posting ${posting.id} (${posting.wage} coins) could not be paid to ${workerId}: ${failure.message}`,
      );
      return false;
    }
    throw failure;
  }
}
