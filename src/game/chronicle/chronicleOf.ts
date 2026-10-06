import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { governmentFactionId } from "../factions/factionRegistry";
import { settlementChronicleComponent } from "../settlement/settlementChronicleComponent";
import type { SettlementChronicleData } from "../settlement/settlementTypes";

/**
 * The live `SettlementChronicle` data of the player government faction (spec 028 FR-018).
 *
 * @param engine - The engine.
 * @returns The component data, or null when there is no game (or no government entity).
 */
export function chronicleOf(engine: GameEngine): SettlementChronicleData | null {
  const id = governmentFactionId(engine);
  const entity = id === null ? undefined : engine.store.get(id);
  return entity === undefined ? null : (getComponent(entity, settlementChronicleComponent) ?? null);
}
