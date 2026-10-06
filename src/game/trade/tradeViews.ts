import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { floorDiv } from "../engine/fixedPoint";
import { governmentFactionId } from "../factions/factionRegistry";
import { getStanding } from "../factions/factionStanding";
import { getAllItems, getTotal } from "../inventory/inventoryQueries";
import { positionComponent } from "../map/positionComponent";
import { orderWait } from "./tradeOrders";
import type { OrderWait } from "./tradeOrders";
import { quoteTrade } from "./tradeQuotes";
import type { TradeQuote } from "./tradeQuotes";
import { getTradeService } from "./tradeServiceRegistry";
import { milliPerItem } from "./tradeTypes";
import type { Item, OrderDirection, RefineRule } from "./tradeTypes";
import { traderComponent, traderDataSchema } from "./traderComponent";
import { listTraders } from "./traderVisits";
import { treasuryBalance } from "./treasury";
import { getTreasuryService } from "./treasuryServiceRegistry";

/**
 * One caravan on the map (query `traders`).
 */
export type TraderView = {
  readonly entityId: EntityId;
  readonly prototypeId: string;
  readonly factionId: EntityId;
  readonly phase: string;
  readonly mapId: number | null;
  readonly cellIndex: number | null;
  readonly arrivedTick: number | null;
  readonly departTick: number | null;
  /**
   * Coins the trader holds.
   */
  readonly coins: number;
  /**
   * What it carries (without coins), ascending by material.
   */
  readonly stock: readonly Item[];
  /**
   * Materials it buys.
   */
  readonly buys: readonly string[];
  readonly refines: readonly RefineRule[];
  /**
   * The trader faction's standing toward the settlement, and whether an agreement stands.
   */
  readonly standing: number;
  readonly tradeAgreement: boolean;
};

/**
 * When a kind of trader comes next (query `traders`).
 */
export type VisitView = {
  readonly traderPrototypeId: string;
  /**
   * The caravan on the map now, or null.
   */
  readonly entityId: EntityId | null;
  /**
   * Tick of the next arrival while no caravan is on the map, else null.
   */
  readonly nextArrivalTick: number | null;
};

/**
 * Result of the `traders` query.
 */
export type TradersView = {
  readonly traders: readonly TraderView[];
  readonly visits: readonly VisitView[];
};

/**
 * One open offer (query `trade-offers`).
 */
export type OfferView = {
  readonly offerId: number;
  readonly negotiationId: number;
  readonly round: number;
  readonly status: string;
  readonly buyerId: EntityId;
  readonly sellerId: EntityId;
  readonly requested: readonly Item[];
  readonly offered: readonly Item[];
  readonly coins: number;
  readonly counterCoins: number | null;
  readonly expiryTick: number;
};

/**
 * One trade order (query `trade-orders`).
 */
export type OrderView = {
  readonly orderId: number;
  readonly traderPrototypeId: string;
  readonly direction: string;
  readonly materialId: string;
  readonly quantity: number;
  readonly remaining: number;
  readonly coins: number;
  readonly status: string;
  readonly postingId: number | null;
  readonly failures: number;
  /**
   * Why the open order has no trip right now (`NoTrader`, `NoStock`, `NoMoney`,
   * `TraderSoldOut`), or null.
   */
  readonly waitingFor: OrderWait | null;
  readonly reason: string | null;
};

/**
 * The refined credit of one good (query `trade-ledger`).
 */
export type LedgerView = {
  readonly traderPrototypeId: string;
  readonly refinedMaterialId: string;
  /**
   * The raw material that earns it and the ratio, from the trader's content.
   */
  readonly rawMaterialId: string | null;
  readonly ratioMilli: number | null;
  readonly creditMilli: number;
  /**
   * Whole units the settlement may still buy: `floor(creditMilli / 1000)`.
   */
  readonly units: number;
};

/**
 * The treasury (query `treasury`).
 */
export type TreasuryView = {
  readonly balance: number;
  readonly pendingWages: readonly {
    readonly paymentId: number;
    readonly workerId: EntityId;
    readonly amount: number;
    readonly createdTick: number;
  }[];
};

/**
 * Lists the caravans on the map and the visit schedule of each kind of trader (query `traders`).
 *
 * @param engine - The engine.
 * @returns The views, ascending by entity id and trader kind.
 */
export function buildTradersView(engine: GameEngine): TradersView {
  const government = governmentFactionId(engine);
  const traders = listTraders(engine).map((entity): TraderView => {
    const data = getComponent(entity, traderComponent);
    const place = getComponent(entity, positionComponent);
    const factionId = data?.factionId ?? 0;
    const standing =
      government === null || factionId === 0 ? null : getStanding(engine, factionId, government);
    return {
      entityId: entity.id,
      prototypeId: entity.prototype,
      factionId,
      phase: data?.phase ?? "",
      mapId: place?.mapId ?? null,
      cellIndex: place?.cellIndex ?? null,
      arrivedTick: data?.arrivedTick ?? null,
      departTick: data?.departTick ?? null,
      coins: getTotal(entity, engine.materials.currencyId),
      stock: getAllItems(entity).filter((item) => item.materialId !== engine.materials.currencyId),
      buys: [...(data?.buys ?? [])],
      refines: (data?.refines ?? []).map((rule) => ({ ...rule })),
      standing: standing?.value ?? 0,
      tradeAgreement: standing?.tradeAgreement ?? false,
    };
  });
  const visits = getTradeService(engine)
    .visits()
    .map((record): VisitView => ({
      traderPrototypeId: record.traderPrototypeId,
      entityId: record.entityId,
      nextArrivalTick: record.entityId === null ? record.nextArrivalTick : null,
    }));
  return { traders, visits };
}

/**
 * Lists the open offers, ascending by id (query `trade-offers`).
 *
 * @param engine - The engine.
 * @returns One view per offer.
 */
export function buildOfferViews(engine: GameEngine): OfferView[] {
  return getTradeService(engine)
    .offers()
    .map((offer) => ({
      offerId: offer.offerId,
      negotiationId: offer.negotiationId,
      round: offer.round,
      status: offer.status,
      buyerId: offer.buyerId,
      sellerId: offer.sellerId,
      requested: offer.requested,
      offered: offer.offered,
      coins: offer.coins,
      counterCoins: offer.counterCoins,
      expiryTick: offer.expiryTick,
    }));
}

/**
 * Lists the trade orders, ascending by id: the open ones and the last finished ones (query
 * `trade-orders`).
 *
 * @param engine - The engine.
 * @returns One view per order.
 */
export function buildOrderViews(engine: GameEngine): OrderView[] {
  return getTradeService(engine)
    .orders()
    .map((order) => ({
      orderId: order.orderId,
      traderPrototypeId: order.traderPrototypeId,
      direction: order.direction,
      materialId: order.materialId,
      quantity: order.quantity,
      remaining: order.remaining,
      coins: order.coins,
      status: order.status,
      postingId: order.postingId,
      failures: order.failures,
      waitingFor: order.status === "Open" ? orderWait(engine, order) : null,
      reason: order.reason,
    }));
}

/**
 * Lists the refined credit of the settlement, with the rule that earns it (query
 * `trade-ledger`, D-13). Credit never expires; zero entries are not listed.
 *
 * @param engine - The engine.
 * @returns One view per refined good with credit, ascending by trader kind and material.
 */
export function buildLedgerViews(engine: GameEngine): LedgerView[] {
  const government = governmentFactionId(engine);
  return getTradeService(engine)
    .ledger()
    .filter((entry) => entry.settlementFactionId === government)
    .map((entry): LedgerView => {
      const rule = listRulesOf(engine, entry.traderPrototypeId).find(
        (candidate) => candidate.refinedMaterialId === entry.refinedMaterialId,
      );
      return {
        traderPrototypeId: entry.traderPrototypeId,
        refinedMaterialId: entry.refinedMaterialId,
        rawMaterialId: rule?.rawMaterialId ?? null,
        ratioMilli: rule?.ratioMilli ?? null,
        creditMilli: entry.creditMilli,
        units: floorDiv(entry.creditMilli, milliPerItem),
      };
    });
}

function listRulesOf(engine: GameEngine, traderPrototypeId: string): RefineRule[] {
  return traderDataSchema.parse(engine.prototypes.instantiate(traderPrototypeId)["Trader"]).refines;
}

/**
 * The treasury balance and the wages waiting to be paid (query `treasury`).
 *
 * @param engine - The engine.
 * @returns The view.
 */
export function buildTreasuryView(engine: GameEngine): TreasuryView {
  return {
    balance: treasuryBalance(engine),
    pendingWages: getTreasuryService(engine)
      .payments()
      .map((payment) => ({ ...payment })),
  };
}

/**
 * Quotes a trade with a caravan that is on the map (query `trade-quote`).
 *
 * @param engine - The engine.
 * @param traderId - The trader entity id.
 * @param direction - From the settlement's side.
 * @param materialId - The material.
 * @param quantity - Units.
 * @returns The quote, or null when the entity is not a trader.
 */
export function buildQuoteView(
  engine: GameEngine,
  traderId: EntityId,
  direction: OrderDirection,
  materialId: string,
  quantity: number,
): TradeQuote | null {
  const trader = engine.store.get(traderId);
  return trader === undefined || getComponent(trader, traderComponent) === undefined
    ? null
    : quoteTrade(engine, trader, direction, materialId, quantity);
}
