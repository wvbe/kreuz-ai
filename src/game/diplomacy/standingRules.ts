import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { governmentFactionId, listFactions } from "../factions/factionRegistry";
import { getStanding, setStanding } from "../factions/factionStanding";
import type { ContentConstants } from "../content/schemas/tableSchemas";
import { setAgreement } from "./agreements";
import { getDiplomacyService } from "./diplomacyServiceRegistry";
import { DeclarationKind } from "./diplomacyTypes";

/**
 * Whether a faction is an NPC faction of the world (it has a seat, D-56).
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The faction entity.
 * @returns True for NPC factions; false for the government, guilds and non-factions.
 */
export function isNpcFaction(engine: GameEngine, factionId: EntityId): boolean {
  const entity = engine.store.get(factionId);
  return entity !== undefined && (getComponent(entity, factionComponent)?.seat ?? null) !== null;
}

/**
 * Scales a negative delta that an NPC faction applies toward the player by the difficulty's
 * `factionHostilityMultiplier` (spec 021 FR-006, 027 FR-015): `trunc(delta x multiplier / 1000)`,
 * so a peaceful game (250) turns -5 into -1. Positive deltas are never scaled.
 *
 * @param engine - The engine.
 * @param delta - The unscaled delta.
 * @returns The scaled delta.
 */
export function scaleHostileDelta(engine: GameEngine, delta: number): number {
  if (delta >= 0) {
    return delta;
  }
  const scaled = Math.trunc(
    (delta * getDiplomacyService(engine).hostilityMultiplierMilli()) / 1000,
  );
  return scaled === 0 ? 0 : scaled;
}

/**
 * Adds a delta to one faction's standing toward another (clamped by `setStanding`, which queues
 * the events). A negative delta applied by an NPC faction to the player government is scaled by
 * {@link scaleHostileDelta}.
 *
 * @param engine - The engine that owns the entities.
 * @param holderId - The faction whose view changes.
 * @param otherId - The faction it looks at.
 * @param delta - The change (integer).
 * @returns The new value.
 */
export function adjustStanding(
  engine: GameEngine,
  holderId: EntityId,
  otherId: EntityId,
  delta: number,
): number {
  const scaled =
    delta < 0 && otherId === governmentFactionId(engine) && isNpcFaction(engine, holderId)
      ? scaleHostileDelta(engine, delta)
      : delta;
  return setStanding(
    engine,
    holderId,
    otherId,
    getStanding(engine, holderId, otherId).value + scaled,
  ).value;
}

/**
 * The standing a gift buys (D-14): `min(giftMaxDelta, giftBaseDelta + floor(value / giftCoinsPerPoint))`.
 * A 100-coin gift is +10, 400 coins or more +25.
 *
 * @param constants - The content constants.
 * @param valueCoins - Value of the gift in whole coins.
 * @returns The delta of the receiver's view of the giver.
 */
export function giftDelta(constants: ContentConstants, valueCoins: number): number {
  return Math.min(
    constants.giftMaxDelta,
    constants.giftBaseDelta + Math.floor(valueCoins / constants.giftCoinsPerPoint),
  );
}

/**
 * Applies a delivered gift: the receiver's view of the giver rises by {@link giftDelta}, the
 * giver's view of the receiver by half of it (rounded down).
 *
 * @param engine - The engine that owns the entities.
 * @param giverId - The sending faction.
 * @param receiverId - The receiving faction.
 * @param valueCoins - Value of the gift in whole coins.
 * @returns The delta of the receiver's view.
 */
export function applyGift(
  engine: GameEngine,
  giverId: EntityId,
  receiverId: EntityId,
  valueCoins: number,
): number {
  const delta = giftDelta(engine.content.constants, valueCoins);
  adjustStanding(engine, receiverId, giverId, delta);
  adjustStanding(engine, giverId, receiverId, Math.floor(delta / 2));
  return delta;
}

/**
 * Applies an accepted agreement or overture: the same delta for both views, and for an agreement
 * the flag on both.
 *
 * @param engine - The engine that owns the entities.
 * @param aId - One faction.
 * @param bId - The other faction.
 * @param delta - The change for each view.
 * @param agreement - True to also form the trade agreement.
 */
export function applyAcceptance(
  engine: GameEngine,
  aId: EntityId,
  bId: EntityId,
  delta: number,
  agreement: boolean,
): void {
  adjustStanding(engine, aId, bId, delta);
  adjustStanding(engine, bId, aId, delta);
  if (agreement) {
    setAgreement(engine, aId, bId, true);
  }
}

/**
 * Applies a declaration to both views (D-14): war sets each view to at most `warStanding` (-60)
 * and cancels a trade agreement; peace raises each view to at least `peaceStanding` (-10);
 * neutrality sets both to 0.
 *
 * @param engine - The engine that owns the entities.
 * @param senderId - The declaring faction.
 * @param targetId - The faction it declares to.
 * @param kind - War, peace or neutrality.
 */
export function applyDeclaration(
  engine: GameEngine,
  senderId: EntityId,
  targetId: EntityId,
  kind: DeclarationKind,
): void {
  const constants = engine.content.constants;
  for (const [holder, other] of [
    [senderId, targetId],
    [targetId, senderId],
  ] as const) {
    const current = getStanding(engine, holder, other).value;
    const next =
      kind === DeclarationKind.War
        ? Math.min(current, constants.warStanding)
        : kind === DeclarationKind.Peace
          ? Math.max(current, constants.peaceStanding)
          : 0;
    setStanding(engine, holder, other, next);
  }
  if (kind === DeclarationKind.War) {
    setAgreement(engine, senderId, targetId, false);
  }
}

/**
 * Moves every standing value one point toward neutral (D-56 decay): positive values fall by 1,
 * negative values rise by 1, a trade agreement flag is untouched. Factions in ascending order, so
 * the events are deterministic.
 *
 * @param engine - The engine that owns the entities.
 * @returns The number of standing entries that moved.
 */
export function decayStandings(engine: GameEngine): number {
  let moved = 0;
  for (const entity of listFactions(engine)) {
    const entries = getComponent(entity, factionComponent)?.standing ?? [];
    for (const entry of [...entries]) {
      if (entry.value !== 0) {
        setStanding(engine, entity.id, entry.factionId, entry.value - Math.sign(entry.value));
        moved += 1;
      }
    }
  }
  return moved;
}
