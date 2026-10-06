import { z } from "zod";
import { cloneJson } from "../ecs/jsonData";
import type { EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { OfferStatus, OrderDirection, OrderStatus, finishedOrderHistory } from "./tradeTypes";
import type { LedgerEntry, StandingGain, TradeOffer, TradeOrder, VisitRecord } from "./tradeTypes";

const idSchema = z.number().int().min(1);
const tickSchema = z.number().int().min(0);
const materialIdSchema = z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
const itemSchema = z.object({ materialId: materialIdSchema, quantity: idSchema }).strict();

const offerSchema = z
  .object({
    offerId: idSchema,
    negotiationId: idSchema,
    round: idSchema,
    buyerId: idSchema,
    sellerId: idSchema,
    requested: z.array(itemSchema),
    offered: z.array(itemSchema),
    coins: tickSchema,
    status: z.nativeEnum(OfferStatus),
    counterCoins: tickSchema.nullable(),
    createdTick: tickSchema,
    expiryTick: tickSchema,
  })
  .strict();

const orderSchema = z
  .object({
    orderId: idSchema,
    traderPrototypeId: z.string().min(1),
    direction: z.nativeEnum(OrderDirection),
    materialId: materialIdSchema,
    quantity: idSchema,
    remaining: tickSchema,
    coins: tickSchema,
    postingId: idSchema.nullable(),
    status: z.nativeEnum(OrderStatus),
    failures: tickSchema,
    createdTick: tickSchema,
    finishedTick: tickSchema.nullable(),
    reason: z.string().nullable(),
  })
  .strict();

const ledgerSchema = z
  .object({
    traderPrototypeId: z.string().min(1),
    settlementFactionId: idSchema,
    refinedMaterialId: materialIdSchema,
    creditMilli: idSchema,
  })
  .strict();

const visitSchema = z
  .object({
    traderPrototypeId: z.string().min(1),
    nextArrivalTick: tickSchema,
    entityId: idSchema.nullable(),
  })
  .strict();

const sectionSchema = z
  .object({
    nextOfferId: idSchema,
    nextOrderId: idSchema,
    offers: z.array(offerSchema),
    orders: z.array(orderSchema),
    ledger: z.array(ledgerSchema),
    visits: z.array(visitSchema),
    gainDay: z.number().int().min(-1),
    gains: z.array(z.object({ factionId: idSchema, gains: idSchema }).strict()),
  })
  .strict()
  .refine(
    (data) =>
      data.offers.every(
        (offer, index) =>
          offer.offerId < data.nextOfferId &&
          (index === 0 || (data.offers[index - 1]?.offerId ?? 0) < offer.offerId),
      ) &&
      data.orders.every(
        (order, index) =>
          order.orderId < data.nextOrderId &&
          (index === 0 || (data.orders[index - 1]?.orderId ?? 0) < order.orderId),
      ),
    { message: "offers and orders must be unique, ascending and below their id counters" },
  );

function byLedgerKey(left: LedgerEntry, right: LedgerEntry): number {
  if (left.traderPrototypeId !== right.traderPrototypeId) {
    return left.traderPrototypeId < right.traderPrototypeId ? -1 : 1;
  }
  if (left.settlementFactionId !== right.settlementFactionId) {
    return left.settlementFactionId - right.settlementFactionId;
  }
  return left.refinedMaterialId < right.refinedMaterialId
    ? -1
    : left.refinedMaterialId > right.refinedMaterialId
      ? 1
      : 0;
}

/**
 * Per-engine trade state that is not on entities (saved in the section `systems.trade`): the
 * open offers and their id counter, the trade orders, the refined-credit ledger (D-13, outlives
 * every caravan entity), the visit schedule of each kind of trader and the standing gained today.
 */
export class TradeService {
  private offerList: TradeOffer[] = [];
  private orderList: TradeOrder[] = [];
  private ledgerList: LedgerEntry[] = [];
  private visitList: VisitRecord[] = [];
  private gainList: StandingGain[] = [];
  private gainDay = -1;
  private nextOffer = 1;
  private nextOrder = 1;

  /**
   * Takes the next offer id (never reused).
   *
   * @returns The id.
   */
  allocateOfferId(): number {
    const id = this.nextOffer;
    this.nextOffer += 1;
    return id;
  }

  /**
   * Stores an offer (replacing the one with the same id).
   *
   * @param offer - The offer.
   */
  putOffer(offer: TradeOffer): void {
    this.offerList = [
      ...this.offerList.filter((held) => held.offerId !== offer.offerId),
      cloneJson(offer),
    ].sort((left, right) => left.offerId - right.offerId);
  }

  /**
   * Looks an offer up.
   *
   * @param offerId - Offer id.
   * @returns A copy, or null when it is gone.
   */
  findOffer(offerId: number): TradeOffer | null {
    const found = this.offerList.find((offer) => offer.offerId === offerId);
    return found === undefined ? null : cloneJson(found);
  }

  /**
   * Removes an offer.
   *
   * @param offerId - Offer id.
   */
  removeOffer(offerId: number): void {
    this.offerList = this.offerList.filter((offer) => offer.offerId !== offerId);
  }

  /**
   * The open offers, ascending by id.
   *
   * @returns Copies.
   */
  offers(): TradeOffer[] {
    return this.offerList.map((offer) => cloneJson(offer));
  }

  /**
   * Creates an open order.
   *
   * @param fields - Trader kind, direction, material, quantity and the current tick.
   * @returns A copy of the new order.
   */
  addOrder(fields: {
    traderPrototypeId: string;
    direction: OrderDirection;
    materialId: string;
    quantity: number;
    tick: number;
  }): TradeOrder {
    const order: TradeOrder = {
      orderId: this.nextOrder,
      traderPrototypeId: fields.traderPrototypeId,
      direction: fields.direction,
      materialId: fields.materialId,
      quantity: fields.quantity,
      remaining: fields.quantity,
      coins: 0,
      postingId: null,
      status: OrderStatus.Open,
      failures: 0,
      createdTick: fields.tick,
      finishedTick: null,
      reason: null,
    };
    this.nextOrder += 1;
    this.orderList.push(order);
    return cloneJson(order);
  }

  /**
   * Replaces an order (matched by id) and drops the oldest finished orders beyond the history.
   *
   * @param order - The changed order.
   */
  putOrder(order: TradeOrder): void {
    this.orderList = this.orderList.map((held) =>
      held.orderId === order.orderId ? cloneJson(order) : held,
    );
    const finished = this.orderList.filter((held) => held.status !== OrderStatus.Open);
    const excess = finished.length - finishedOrderHistory;
    if (excess > 0) {
      const dropped = new Set(finished.slice(0, excess).map((held) => held.orderId));
      this.orderList = this.orderList.filter((held) => !dropped.has(held.orderId));
    }
  }

  /**
   * Looks an order up.
   *
   * @param orderId - Order id.
   * @returns A copy, or null.
   */
  findOrder(orderId: number): TradeOrder | null {
    const found = this.orderList.find((order) => order.orderId === orderId);
    return found === undefined ? null : cloneJson(found);
  }

  /**
   * The open order whose trade job is the posting (a closed order has no job any more).
   *
   * @param postingId - Posting id.
   * @returns A copy, or null.
   */
  orderOfPosting(postingId: number): TradeOrder | null {
    const found = this.orderList.find(
      (order) => order.postingId === postingId && order.status === OrderStatus.Open,
    );
    return found === undefined ? null : cloneJson(found);
  }

  /**
   * All orders (open ones and the last finished ones), ascending by id.
   *
   * @returns Copies.
   */
  orders(): TradeOrder[] {
    return this.orderList.map((order) => cloneJson(order));
  }

  /**
   * The refined credit of one settlement with one kind of trader.
   *
   * @param traderPrototypeId - The trader kind.
   * @param settlementFactionId - The settlement's faction.
   * @param refinedMaterialId - The refined good.
   * @returns Milli-items of credit, 0 when none.
   */
  creditOf(
    traderPrototypeId: string,
    settlementFactionId: EntityId,
    refinedMaterialId: string,
  ): number {
    return (
      this.ledgerList.find(
        (entry) =>
          entry.traderPrototypeId === traderPrototypeId &&
          entry.settlementFactionId === settlementFactionId &&
          entry.refinedMaterialId === refinedMaterialId,
      )?.creditMilli ?? 0
    );
  }

  /**
   * Sets a credit; 0 removes the entry. The ledger never expires entries by time.
   *
   * @param entry - Key and the new credit in milli-items.
   */
  setCredit(entry: LedgerEntry): void {
    const rest = this.ledgerList.filter(
      (held) =>
        held.traderPrototypeId !== entry.traderPrototypeId ||
        held.settlementFactionId !== entry.settlementFactionId ||
        held.refinedMaterialId !== entry.refinedMaterialId,
    );
    this.ledgerList = (entry.creditMilli > 0 ? [...rest, { ...entry }] : rest).sort(byLedgerKey);
  }

  /**
   * The ledger, ascending by trader kind, settlement and refined good.
   *
   * @returns Copies.
   */
  ledger(): LedgerEntry[] {
    return this.ledgerList.map((entry) => ({ ...entry }));
  }

  /**
   * The visit record of a kind of trader.
   *
   * @param traderPrototypeId - The trader kind.
   * @returns A copy, or null when none exists yet.
   */
  visitOf(traderPrototypeId: string): VisitRecord | null {
    const found = this.visitList.find((visit) => visit.traderPrototypeId === traderPrototypeId);
    return found === undefined ? null : { ...found };
  }

  /**
   * Stores a visit record (replacing the one of the same trader kind).
   *
   * @param record - The record.
   */
  putVisit(record: VisitRecord): void {
    this.visitList = [
      ...this.visitList.filter((visit) => visit.traderPrototypeId !== record.traderPrototypeId),
      { ...record },
    ].sort((left, right) =>
      left.traderPrototypeId < right.traderPrototypeId
        ? -1
        : left.traderPrototypeId > right.traderPrototypeId
          ? 1
          : 0,
    );
  }

  /**
   * The visit records, ascending by trader kind.
   *
   * @returns Copies.
   */
  visits(): VisitRecord[] {
    return this.visitList.map((visit) => ({ ...visit }));
  }

  /**
   * How much standing a faction gained from trading on a day.
   *
   * @param day - Game day.
   * @param factionId - The trader faction.
   * @returns Points gained so far that day.
   */
  gainedOn(day: number, factionId: EntityId): number {
    return this.gainDay === day
      ? (this.gainList.find((entry) => entry.factionId === factionId)?.gains ?? 0)
      : 0;
  }

  /**
   * Counts standing points gained on a day (a new day starts a fresh count).
   *
   * @param day - Game day.
   * @param factionId - The trader faction.
   * @param points - Points gained.
   */
  addGain(day: number, factionId: EntityId, points: number): void {
    if (this.gainDay !== day) {
      this.gainDay = day;
      this.gainList = [];
    }
    const held = this.gainList.find((entry) => entry.factionId === factionId);
    if (held === undefined) {
      this.gainList = [...this.gainList, { factionId, gains: points }].sort(
        (left, right) => left.factionId - right.factionId,
      );
    } else {
      held.gains += points;
    }
  }

  /**
   * The save section `systems.trade`.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "trade",
      location: SaveSectionLocation.Systems,
      schema: sectionSchema,
      serialize: (): JsonValue => ({
        nextOfferId: this.nextOffer,
        nextOrderId: this.nextOrder,
        offers: this.offers(),
        orders: this.orders(),
        ledger: this.ledger(),
        visits: this.visits(),
        gainDay: this.gainDay,
        gains: this.gainList.map((entry) => ({ ...entry })),
      }),
      restore: (saved: JsonValue) => {
        const parsed = sectionSchema.parse(saved);
        this.nextOffer = parsed.nextOfferId;
        this.nextOrder = parsed.nextOrderId;
        this.offerList = parsed.offers;
        this.orderList = parsed.orders;
        this.ledgerList = parsed.ledger.sort(byLedgerKey);
        this.visitList = parsed.visits;
        this.gainDay = parsed.gainDay;
        this.gainList = parsed.gains;
      },
      defaultForOlderSaves: () => ({
        nextOfferId: 1,
        nextOrderId: 1,
        offers: [],
        orders: [],
        ledger: [],
        visits: [],
        gainDay: -1,
        gains: [],
      }),
    };
  }
}
