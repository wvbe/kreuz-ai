import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getStanding } from "../factions/factionStanding";
import { isHostilePair } from "../factions/standingAttitude";
import { hasAgreement } from "./agreements";
import { DeclarationKind, DiplomaticActType, actResolvedEvent } from "./diplomacyTypes";
import type { ActResolved, EnvoyData } from "./diplomacyTypes";
import { adjustStanding, applyAcceptance, applyDeclaration, applyGift } from "./standingRules";

/**
 * Whether the target of a trade agreement takes it (D-14, E-20): its standing toward the sender is
 * at least `agreementMinStanding` (20) and neither side is hostile. An agreement that already
 * stands counts as taken. Deterministic, no stream.
 *
 * @param engine - The engine that owns the entities.
 * @param senderId - The proposing faction.
 * @param targetId - The faction that answers.
 * @returns True when it accepts.
 */
export function acceptsAgreement(
  engine: GameEngine,
  senderId: EntityId,
  targetId: EntityId,
): boolean {
  return (
    hasAgreement(engine, senderId, targetId) ||
    (getStanding(engine, targetId, senderId).value >=
      engine.content.constants.agreementMinStanding &&
      !isHostilePair(engine, senderId, targetId))
  );
}

/**
 * Whether the target of an overture takes it: its standing toward the sender is at least
 * `overtureMinStanding` (-15).
 *
 * @param engine - The engine that owns the entities.
 * @param senderId - The faction that makes the overture.
 * @param targetId - The faction that answers.
 * @returns True when it accepts.
 */
export function acceptsOverture(
  engine: GameEngine,
  senderId: EntityId,
  targetId: EntityId,
): boolean {
  return (
    getStanding(engine, targetId, senderId).value >= engine.content.constants.overtureMinStanding
  );
}

/**
 * Applies an accepted agreement or overture to both views (also used when the player accepts an
 * incoming proposal): agreement +`agreementAcceptedDelta` each and the flag on both, overture
 * +`overtureAcceptedDelta` each.
 *
 * @param engine - The engine that owns the entities.
 * @param actType - Trade agreement or overture.
 * @param aId - One faction.
 * @param bId - The other faction.
 */
export function applyAccepted(
  engine: GameEngine,
  actType: DiplomaticActType,
  aId: EntityId,
  bId: EntityId,
): void {
  const constants = engine.content.constants;
  if (actType === DiplomaticActType.TradeAgreement) {
    applyAcceptance(engine, aId, bId, constants.agreementAcceptedDelta, true);
  } else {
    applyAcceptance(engine, aId, bId, constants.overtureAcceptedDelta, false);
  }
}

/**
 * Applies a delivered act to the standing of both factions (spec 021 FR-006, D-14) and queues
 * `diplomacy.act.resolved`:
 * - gift: the receiver's view +`giftDelta(value)`, the giver's +half;
 * - trade agreement: accepted by {@link acceptsAgreement} (+10 both, flag on both), else nothing;
 * - declaration: war, peace or neutrality on both views (war cancels an agreement);
 * - overture: accepted by {@link acceptsOverture} (+5 both), else the receiver's view of the
 *   sender falls by `rejectionPenalty`.
 *
 * @param engine - The engine that owns the entities.
 * @param envoyId - The envoy that carried it (for the event).
 * @param data - The envoy's message.
 * @returns True when the target accepted (gifts and declarations always are).
 */
export function resolveAct(engine: GameEngine, envoyId: EntityId, data: EnvoyData): boolean {
  const { senderFactionId: senderId, targetFactionId: targetId } = data;
  let accepted = true;
  switch (data.actType) {
    case DiplomaticActType.Gift:
      applyGift(engine, senderId, targetId, data.giftValueCoins);
      break;
    case DiplomaticActType.TradeAgreement:
      accepted = acceptsAgreement(engine, senderId, targetId);
      if (accepted) {
        applyAccepted(engine, data.actType, senderId, targetId);
      }
      break;
    case DiplomaticActType.Declaration:
      applyDeclaration(engine, senderId, targetId, data.declaration ?? DeclarationKind.Neutrality);
      break;
    case DiplomaticActType.Overture:
      accepted = acceptsOverture(engine, senderId, targetId);
      if (accepted) {
        applyAccepted(engine, data.actType, senderId, targetId);
      } else {
        adjustStanding(engine, targetId, senderId, -engine.content.constants.rejectionPenalty);
      }
      break;
  }
  const payload: ActResolved = {
    envoyId,
    senderFactionId: senderId,
    targetFactionId: targetId,
    actType: data.actType,
    accepted,
  };
  engine.bus.emit(actResolvedEvent, payload);
  return accepted;
}
