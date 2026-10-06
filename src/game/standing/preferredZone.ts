import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getStandingService } from "./standingServiceRegistry";
import { StandingOrderScope } from "./standingTypes";

/**
 * The zone goods of a material are steered into (spec 026 FR-020, installed with
 * `StorageService.setZonePreference`): the zone of the lowest-numbered live, unpaused zone-scoped
 * standing order for the material that is restocking and whose zone still exists. Storage routing
 * ranks storage inside that zone first and keeps every other route as the fallback, so goods that
 * do not fit there are stored the usual way (018 FR-010).
 *
 * @param engine - The engine.
 * @param materialId - The material that is about to be stored.
 * @returns The zone id, or null when no order asks for one.
 */
export function preferredZone(engine: GameEngine, materialId: string): EntityId | null {
  const order = getStandingService(engine).state.orders.find(
    (candidate) =>
      candidate.scope === StandingOrderScope.Zone &&
      candidate.materialId === materialId &&
      candidate.restocking &&
      !candidate.paused &&
      !candidate.deleted &&
      candidate.zoneId !== null &&
      engine.store.get(candidate.zoneId) !== undefined,
  );
  return order?.zoneId ?? null;
}
