import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "./factionComponent";
import { FactionError, FactionErrorKind } from "./FactionError";
import { attitudeOfValue } from "./attitudeBands";
import {
  attitudeChangedEvent,
  maxStanding,
  minStanding,
  standingChangedEvent,
} from "./factionTypes";
import type { AttitudeChanged, StandingChanged, StandingEntry } from "./factionTypes";

/**
 * Clamps a standing value to `-100..100` (spec 021 FR-007).
 *
 * @param value - Any integer.
 * @returns The clamped value.
 */
export function clampStanding(value: number): number {
  return Math.max(minStanding, Math.min(maxStanding, value));
}

function requireFactionData(
  engine: GameEngine,
  factionId: EntityId,
): { standing: StandingEntry[] } {
  const entity = engine.store.get(factionId);
  const faction = entity === undefined ? undefined : getComponent(entity, factionComponent);
  if (faction === undefined) {
    throw new FactionError(FactionErrorKind.UnknownFaction, `entity ${factionId} is not a faction`);
  }
  return faction;
}

/**
 * How one faction sees another: the stored entry, or the default (0, no agreement). Standing is
 * asymmetric: `getStanding(a, b)` and `getStanding(b, a)` are independent.
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The faction whose view is read.
 * @param otherFactionId - The faction it looks at.
 * @returns The entry (a copy).
 */
export function getStanding(
  engine: GameEngine,
  factionId: EntityId,
  otherFactionId: EntityId,
): StandingEntry {
  const found = requireFactionData(engine, factionId).standing.find(
    (entry) => entry.factionId === otherFactionId,
  );
  return found === undefined
    ? { factionId: otherFactionId, value: 0, tradeAgreement: false }
    : { ...found };
}

/**
 * Sets one faction's standing toward another, clamped, keeping the list ascending and dropping an
 * entry that returns to the default. Queues `diplomacy.standing.changed` when the value changes
 * and `diplomacy.attitude.changed` when it moves into another band (`Attitude`). The deltas of
 * acts, incidents and decay live in `src/game/diplomacy` and call this.
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The faction whose view changes.
 * @param otherFactionId - The faction it looks at.
 * @param value - The new standing (clamped).
 * @param tradeAgreement - New agreement flag; default keeps the current one.
 * @returns The stored entry.
 */
export function setStanding(
  engine: GameEngine,
  factionId: EntityId,
  otherFactionId: EntityId,
  value: number,
  tradeAgreement?: boolean,
): StandingEntry {
  const faction = requireFactionData(engine, factionId);
  const before = getStanding(engine, factionId, otherFactionId);
  const next: StandingEntry = {
    factionId: otherFactionId,
    value: clampStanding(value),
    tradeAgreement: tradeAgreement ?? before.tradeAgreement,
  };
  const rest = faction.standing.filter((entry) => entry.factionId !== otherFactionId);
  faction.standing =
    next.value === 0 && !next.tradeAgreement
      ? rest
      : [...rest, next].sort((left, right) => left.factionId - right.factionId);
  if (next.value !== before.value) {
    const payload: StandingChanged = {
      factionId,
      otherFactionId,
      oldValue: before.value,
      newValue: next.value,
    };
    engine.bus.emit(standingChangedEvent, payload);
    const oldAttitude = attitudeOfValue(engine.content.constants, before.value);
    const newAttitude = attitudeOfValue(engine.content.constants, next.value);
    if (oldAttitude !== newAttitude) {
      const changed: AttitudeChanged = { factionId, otherFactionId, oldAttitude, newAttitude };
      engine.bus.emit(attitudeChangedEvent, changed);
    }
  }
  return next;
}
