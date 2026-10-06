import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { governmentFactionId } from "../factions/factionRegistry";
import { settlementProgressComponent } from "./settlementProgressComponent";
import type { SettlementProgressData } from "./settlementTypes";

/**
 * The live `SettlementProgress` data of the player government faction (spec 027 FR-002).
 *
 * @param engine - The engine.
 * @returns The component data, or null when there is no game (or no government entity).
 */
export function settlementProgressOf(engine: GameEngine): SettlementProgressData | null {
  const id = governmentFactionId(engine);
  const entity = id === null ? undefined : engine.store.get(id);
  return entity === undefined ? null : (getComponent(entity, settlementProgressComponent) ?? null);
}
