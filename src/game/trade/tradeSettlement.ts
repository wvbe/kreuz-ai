import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { governmentFactionId } from "../factions/factionRegistry";
import { recordFlow } from "../status/flow/recordFlow";
import { FlowDirection, FlowSource } from "../status/statusTypes";
import { drawRefinedCredit, grantRefinedCredit } from "./refinedLedger";
import { applyTradeStanding } from "./applyTradeStanding";
import { tradeCompletedEvent } from "./tradeTypes";
import type { Leg, TradeCompleted, TradeOffer } from "./tradeTypes";
import { traderComponent } from "./traderComponent";

/**
 * Whether an entity belongs to the player settlement for the trade ledger: the government
 * faction (its treasury) or a citizen who is a member of it (DECISIONS D-26, attribution of 025
 * FR-012).
 *
 * @param engine - The engine.
 * @param entity - The entity.
 * @returns True for the treasury and the settlement's citizens.
 */
export function isSettlementSide(engine: GameEngine, entity: Entity): boolean {
  const government = governmentFactionId(engine);
  if (government === null) {
    return false;
  }
  if (entity.id === government) {
    return true;
  }
  return getComponent(entity, citizenComponent)?.factions.includes(government) ?? false;
}

function isSide(engine: GameEngine, id: EntityId): boolean {
  const entity = engine.store.get(id);
  return entity !== undefined && isSettlementSide(engine, entity);
}

/**
 * Records the goods of a trade in the flow ledger (`FlowSource.Trade`, spec 025): goods that
 * reach the settlement count as produced, goods that leave it as consumed, but only when exactly
 * one party is the settlement (coins are never counted).
 *
 * @param engine - The engine.
 * @param legs - The transfers that were executed.
 */
export function recordTradeFlow(engine: GameEngine, legs: readonly Leg[]): void {
  for (const leg of legs) {
    if (leg.materialId === engine.materials.currencyId) {
      continue;
    }
    const fromSide = isSide(engine, leg.fromId);
    const toSide = isSide(engine, leg.toId);
    if (fromSide === toSide) {
      continue;
    }
    recordFlow(engine, {
      materialId: leg.materialId,
      direction: toSide ? FlowDirection.Produced : FlowDirection.Consumed,
      source: FlowSource.Trade,
      subject: null,
      quantity: leg.quantity,
    });
  }
}

/**
 * Everything that follows an executed trade (spec 019 FR-010, DECISIONS D-13, D-14): the
 * refined-credit ledger (a trader that bought raw goods earns the settlement credit, a trader
 * that sold a refined good draws it down), the flow ledger, the standing hook and
 * `trade.completed`.
 *
 * @param engine - The engine.
 * @param offer - The offer that was executed.
 * @param legs - The transfers that were executed.
 */
export function settleTrade(engine: GameEngine, offer: TradeOffer, legs: readonly Leg[]): void {
  const buyer = engine.store.require(offer.buyerId);
  const seller = engine.store.require(offer.sellerId);
  if (getComponent(buyer, traderComponent) !== undefined) {
    grantRefinedCredit(engine, buyer, offer.requested);
  }
  if (getComponent(seller, traderComponent) !== undefined) {
    for (const item of offer.requested) {
      drawRefinedCredit(engine, seller, item.materialId, item.quantity);
    }
  }
  recordTradeFlow(engine, legs);
  const trader = [buyer, seller].find(
    (party) => getComponent(party, traderComponent) !== undefined,
  );
  if (trader !== undefined) {
    applyTradeStanding(engine, trader);
  }
  const coin = engine.materials.currencyId;
  const payload: TradeCompleted = {
    offerId: offer.offerId,
    buyerId: offer.buyerId,
    sellerId: offer.sellerId,
    items: offer.requested.map((item) => ({ ...item })),
    payment: [
      ...offer.offered.map((item) => ({ ...item })),
      ...(offer.coins > 0 ? [{ materialId: coin, quantity: offer.coins }] : []),
    ],
    tick: engine.time.tickCount,
  };
  engine.bus.emit(tradeCompletedEvent, payload);
}
