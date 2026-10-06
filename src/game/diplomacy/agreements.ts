import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { listFactions } from "../factions/factionRegistry";
import { getStanding, setStanding } from "../factions/factionStanding";
import { agreementCancelledEvent, agreementFormedEvent } from "./diplomacyTypes";
import type { AgreementChanged } from "./diplomacyTypes";

/**
 * A trade agreement between two factions (stored as the flag on both standing lists).
 */
export type Agreement = {
  factionAId: EntityId;
  factionBId: EntityId;
};

/**
 * Whether the two factions hold a trade agreement: the flag on either side's entry (an agreement is
 * always written to both, so one side is enough for a damaged save).
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - One faction.
 * @param otherFactionId - The other faction.
 * @returns True when an agreement stands.
 */
export function hasAgreement(
  engine: GameEngine,
  factionId: EntityId,
  otherFactionId: EntityId,
): boolean {
  return (
    getStanding(engine, factionId, otherFactionId).tradeAgreement ||
    getStanding(engine, otherFactionId, factionId).tradeAgreement
  );
}

/**
 * Forms or cancels the trade agreement of two factions: the flag is set on both standing lists and
 * `diplomacy.agreement.formed` / `.cancelled` is queued once, when the state changes. Standing
 * values are kept.
 *
 * @param engine - The engine that owns the entities.
 * @param factionAId - One faction.
 * @param factionBId - The other faction.
 * @param agreed - True to form, false to cancel.
 * @returns True when the state changed.
 */
export function setAgreement(
  engine: GameEngine,
  factionAId: EntityId,
  factionBId: EntityId,
  agreed: boolean,
): boolean {
  const had = hasAgreement(engine, factionAId, factionBId);
  setStanding(
    engine,
    factionAId,
    factionBId,
    getStanding(engine, factionAId, factionBId).value,
    agreed,
  );
  setStanding(
    engine,
    factionBId,
    factionAId,
    getStanding(engine, factionBId, factionAId).value,
    agreed,
  );
  if (had === agreed) {
    return false;
  }
  const payload: AgreementChanged = { factionAId, factionBId };
  engine.bus.emit(agreed ? agreementFormedEvent : agreementCancelledEvent, payload);
  return true;
}

/**
 * Every trade agreement, once per pair (lower faction id first), ascending.
 *
 * @param engine - The engine that owns the entities.
 * @returns The agreements.
 */
export function listAgreements(engine: GameEngine): Agreement[] {
  const keys = new Set<string>();
  const found: Agreement[] = [];
  for (const entity of listFactions(engine)) {
    for (const entry of getComponent(entity, factionComponent)?.standing ?? []) {
      const factionAId = Math.min(entity.id, entry.factionId);
      const factionBId = Math.max(entity.id, entry.factionId);
      const key = `${factionAId}:${factionBId}`;
      if (entry.tradeAgreement && !keys.has(key)) {
        keys.add(key);
        found.push({ factionAId, factionBId });
      }
    }
  }
  return found.sort(
    (left, right) => left.factionAId - right.factionAId || left.factionBId - right.factionBId,
  );
}
