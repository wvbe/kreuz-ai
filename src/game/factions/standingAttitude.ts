import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { Attitude, attitudeOfValue } from "./attitudeBands";
import { getStanding } from "./factionStanding";

/**
 * How one faction currently sees another, as a band.
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The faction whose view is read.
 * @param otherFactionId - The faction it looks at.
 * @returns The band of `getStanding(factionId, otherFactionId)`.
 */
export function getAttitude(
  engine: GameEngine,
  factionId: EntityId,
  otherFactionId: EntityId,
): Attitude {
  return attitudeOfValue(
    engine.content.constants,
    getStanding(engine, factionId, otherFactionId).value,
  );
}

/**
 * Whether either faction is hostile toward the other: the **derived `hostile` status** that the
 * trade gate (`faction-hostile`) and the labour gate read (D-56). Unknown factions are never
 * hostile.
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - One faction.
 * @param otherFactionId - The other faction.
 * @returns True when at least one view is below `hostileStanding`.
 */
export function isHostilePair(
  engine: GameEngine,
  factionId: EntityId,
  otherFactionId: EntityId,
): boolean {
  return (
    getAttitude(engine, factionId, otherFactionId) === Attitude.Hostile ||
    getAttitude(engine, otherFactionId, factionId) === Attitude.Hostile
  );
}
