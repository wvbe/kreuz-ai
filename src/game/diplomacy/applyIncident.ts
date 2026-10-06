import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { IncidentKind, incidentEvent } from "./diplomacyTypes";
import type { IncidentHappened } from "./diplomacyTypes";
import { adjustStanding, scaleHostileDelta } from "./standingRules";

/**
 * An NPC faction insults the settlement (D-56, the only incident; there is no combat or raiding):
 * the settlement's view of it falls by `incidentStandingDelta` (-5), scaled by the difficulty's
 * hostility multiplier (peaceful turns it into -1); the faction's own view of the settlement falls
 * by `incidentReciprocalDelta` (-2, scaled the same way, so repeated insults move it toward the
 * hostile gate). Queues `diplomacy.incident`.
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The insulting NPC faction.
 * @param governmentId - The player's government faction.
 * @returns The delta applied to the settlement's view.
 */
export function applyIncident(
  engine: GameEngine,
  factionId: EntityId,
  governmentId: EntityId,
): number {
  const constants = engine.content.constants;
  const delta = scaleHostileDelta(engine, constants.incidentStandingDelta);
  adjustStanding(engine, governmentId, factionId, delta);
  adjustStanding(engine, factionId, governmentId, constants.incidentReciprocalDelta);
  const payload: IncidentHappened = {
    factionId,
    targetFactionId: governmentId,
    kind: IncidentKind.Insult,
    delta,
  };
  engine.bus.emit(incidentEvent, payload);
  return delta;
}
