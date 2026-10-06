import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { JobError, JobErrorKind } from "../jobs/JobError";
import { positionComponent } from "../map/positionComponent";
import { abandonUpdate } from "./boardUpdates";
import { deliverTaskOf } from "./crierQueries";
import { getCrierService } from "./crierServiceRegistry";
import { crierLostReason } from "./crierTypes";
import { townCrierComponent } from "./townCrierComponent";

/**
 * Makes a citizen a Town Crier (command `AppointTownCrier`, DECISIONS D-12): the entity gets the
 * `TownCrier` component, available with nothing to carry. A crier keeps living like any other
 * settler (it works jobs while it has no delivery). Throws `JobError` `IneligibleCrier` when the
 * entity does not exist, is not a citizen or is not on a map. The Steward cannot be a crier
 * (026); that check arrives with the Steward in task 4.3.
 *
 * @param engine - The engine.
 * @param entityId - The citizen to appoint.
 * @returns True when it became a crier, false when it already was one.
 */
export function appointCrier(engine: GameEngine, entityId: EntityId): boolean {
  const entity = engine.store.get(entityId);
  if (
    entity === undefined ||
    getComponent(entity, citizenComponent) === undefined ||
    getComponent(entity, positionComponent) === undefined
  ) {
    throw new JobError(
      JobErrorKind.IneligibleCrier,
      `entity ${entityId} is not a citizen on a map and cannot be a Town Crier`,
    );
  }
  if (getComponent(entity, townCrierComponent) !== undefined) {
    return false;
  }
  engine.store.addComponent(entityId, townCrierComponent, {});
  return true;
}

/**
 * Takes the Town Crier role away (command `DismissTownCrier`). What the crier carried goes back
 * to the waiting queue for the next free crier and its walk is cancelled.
 *
 * @param engine - The engine.
 * @param entityId - The crier.
 * @returns True when it was a crier.
 */
export function dismissCrier(engine: GameEngine, entityId: EntityId): boolean {
  const entity = engine.store.get(entityId);
  const data = entity === undefined ? undefined : getComponent(entity, townCrierComponent);
  if (entity === undefined || data === undefined) {
    return false;
  }
  getCrierService(engine).unassign(data.carrying);
  const task = deliverTaskOf(engine, entityId);
  if (task !== undefined) {
    engine.tasks.cancel(entityId, task.id);
  }
  engine.store.removeComponent(entityId, townCrierComponent);
  return true;
}

/**
 * What happens to a crier's load when the crier is deleted (spec 017 edge case): the updates it
 * carried are lost and abandoned (`crier_lost`), the updates still waiting are untouched.
 *
 * @param engine - The engine.
 * @param entityId - The entity about to be deleted.
 */
export function loseCrierLoad(engine: GameEngine, entityId: EntityId): void {
  const entity = engine.store.get(entityId);
  const data = entity === undefined ? undefined : getComponent(entity, townCrierComponent);
  if (data === undefined) {
    return;
  }
  for (const updateId of data.carrying) {
    abandonUpdate(engine, updateId, crierLostReason);
  }
}
