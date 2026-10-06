import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const itemSchema = z.object({ materialId: z.string(), quantity: z.number() });

const traderSchema = z.object({
  entityId: z.number(),
  prototypeId: z.string(),
  phase: z.string(),
  mapId: z.number().nullable(),
  cellIndex: z.number().nullable(),
  arrivedTick: z.number().nullable(),
  departTick: z.number().nullable(),
  coins: z.number(),
  stock: z.array(itemSchema),
  buys: z.array(z.string()),
  standing: z.number(),
  tradeAgreement: z.boolean(),
});

const tradersSchema = z.object({
  traders: z.array(traderSchema),
  visits: z.array(
    z.object({
      traderPrototypeId: z.string(),
      entityId: z.number().nullable(),
      nextArrivalTick: z.number().nullable(),
    }),
  ),
});

const orderSchema = z.object({
  orderId: z.number(),
  traderPrototypeId: z.string(),
  direction: z.string(),
  materialId: z.string(),
  quantity: z.number(),
  remaining: z.number(),
  coins: z.number(),
  status: z.string(),
  failures: z.number(),
  waitingFor: z.string().nullable(),
  reason: z.string().nullable(),
});

const offerSchema = z.object({
  offerId: z.number(),
  round: z.number(),
  status: z.string(),
  buyerId: z.number(),
  sellerId: z.number(),
  requested: z.array(itemSchema),
  offered: z.array(itemSchema),
  coins: z.number(),
  counterCoins: z.number().nullable(),
  expiryTick: z.number(),
});

const ledgerSchema = z.object({
  traderPrototypeId: z.string(),
  refinedMaterialId: z.string(),
  rawMaterialId: z.string().nullable(),
  ratioMilli: z.number().nullable(),
  creditMilli: z.number(),
  units: z.number(),
});

const treasurySchema = z.object({
  balance: z.number(),
  pendingWages: z.array(
    z.object({ paymentId: z.number(), workerId: z.number(), amount: z.number() }),
  ),
});

const quoteSchema = z.object({
  direction: z.string(),
  materialId: z.string(),
  quantity: z.number(),
  coins: z.number().nullable(),
  ceilingCoins: z.number().nullable(),
  available: z.number(),
  reason: z.string().nullable(),
});

function items(list: readonly { materialId: string; quantity: number }[]): string {
  return list.length === 0
    ? "nothing"
    : list.map((item) => `${item.quantity} ${item.materialId}`).join(", ");
}

/**
 * Formats the `traders` query for the `traders` verb: one line per caravan with where it stands,
 * its coins and stock, what it buys and its standing, then when each kind comes next.
 *
 * @param view - Data of the `traders` query.
 * @returns Output lines; a note when no caravan is on the map; empty for a foreign view.
 */
export function formatTraders(view: JsonValue): string[] {
  const parsed = tradersSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const lines: string[] = [];
  for (const trader of parsed.data.traders) {
    const where = trader.cellIndex === null ? "" : ` at ${trader.mapId}:${trader.cellIndex}`;
    const stay = trader.departTick === null ? "" : `, leaves at tick ${trader.departTick}`;
    lines.push(
      `trader #${trader.entityId} ${trader.prototypeId} ${trader.phase}${where}${stay}: ${trader.coins} coins, standing ${trader.standing}${trader.tradeAgreement ? " (trade agreement)" : ""}`,
    );
    lines.push(`  sells ${items(trader.stock)}`);
    lines.push(`  buys ${trader.buys.length === 0 ? "nothing" : trader.buys.join(", ")}`);
  }
  if (parsed.data.traders.length === 0) {
    lines.push("no trader is here");
  }
  for (const visit of parsed.data.visits) {
    lines.push(
      visit.entityId === null
        ? `${visit.traderPrototypeId}: next caravan at tick ${visit.nextArrivalTick}`
        : `${visit.traderPrototypeId}: caravan #${visit.entityId} is on the map`,
    );
  }
  return lines;
}

/**
 * Formats the `trade-orders` query for `trade orders`: one line per order with progress and what
 * it waits for.
 *
 * @param view - Data of the `trade-orders` query.
 * @returns Output lines; a note when there are no orders; empty for a foreign view.
 */
export function formatOrders(view: JsonValue): string[] {
  const parsed = z.array(orderSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no trade orders (trade sell|buy <trader> <material> <quantity>)"];
  }
  return parsed.data.map((order) => {
    const verb = order.direction === "Sell" ? "sell" : "buy";
    const money = order.direction === "Sell" ? "earned" : "spent";
    const tail =
      order.status === "Open"
        ? order.waitingFor === null
          ? ""
          : `, waiting: ${order.waitingFor}`
        : order.reason === null
          ? ""
          : `, ${order.reason}`;
    return `order #${order.orderId} ${verb} ${order.materialId} ${order.quantity - order.remaining}/${order.quantity} with ${order.traderPrototypeId}: ${order.status}, ${money} ${order.coins} coins${order.failures > 0 ? `, ${order.failures} failed` : ""}${tail}`;
  });
}

/**
 * Formats the `trade-offers` query for `trade offers`: one line per open offer.
 *
 * @param view - Data of the `trade-offers` query.
 * @returns Output lines; a note when there are none; empty for a foreign view.
 */
export function formatOffers(view: JsonValue): string[] {
  const parsed = z.array(offerSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no open offers"];
  }
  return parsed.data.map(
    (offer) =>
      `offer #${offer.offerId} round ${offer.round} ${offer.status}: #${offer.buyerId} asks ${items(offer.requested)} from #${offer.sellerId} for ${offer.coins} coins${offer.offered.length === 0 ? "" : ` and ${items(offer.offered)}`}${offer.counterCoins === null ? "" : `, counter ${offer.counterCoins} coins`}, expires at tick ${offer.expiryTick}`,
  );
}

/**
 * Formats the `trade-ledger` query for the `ledger` verb: the refined credit of the settlement.
 *
 * @param view - Data of the `trade-ledger` query.
 * @returns Output lines; a note when there is no credit; empty for a foreign view.
 */
export function formatLedger(view: JsonValue): string[] {
  const parsed = z.array(ledgerSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no refined credit (sell raw goods to a trader that refines them)"];
  }
  return parsed.data.map((entry) => {
    const rule =
      entry.rawMaterialId === null || entry.ratioMilli === null
        ? ""
        : ` (${entry.rawMaterialId} x ${entry.ratioMilli / 1000})`;
    return `${entry.traderPrototypeId}: ${entry.units} ${entry.refinedMaterialId} may still be bought, credit ${entry.creditMilli / 1000}${rule}`;
  });
}

/**
 * Formats the `treasury` query for the `treasury` verb: the balance and the queued wages.
 *
 * @param view - Data of the `treasury` query.
 * @returns Output lines; empty for a foreign view.
 */
export function formatTreasury(view: JsonValue): string[] {
  const parsed = treasurySchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const lines = [`treasury: ${parsed.data.balance} coins`];
  for (const wage of parsed.data.pendingWages) {
    lines.push(
      `  wage #${wage.paymentId} of ${wage.amount} coins for #${wage.workerId} is waiting`,
    );
  }
  return lines;
}

/**
 * Formats the `trade-quote` query for `trade quote`.
 *
 * @param view - Data of the `trade-quote` query (null for an entity that is not a trader).
 * @returns Output lines; empty for a foreign view.
 */
export function formatQuote(view: JsonValue): string[] {
  if (view === null) {
    return ["that entity is not a trader"];
  }
  const parsed = quoteSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const quote = parsed.data;
  const side = quote.direction === "Sell" ? "sell to the trader" : "buy from the trader";
  if (quote.reason !== null) {
    return [`${quote.quantity} ${quote.materialId}, ${side}: not possible (${quote.reason})`];
  }
  const price =
    quote.coins === null
      ? "no value"
      : quote.direction === "Sell"
        ? `${quote.coins} coins (up to ${quote.ceilingCoins} after a counter)`
        : `${quote.coins} coins`;
  return [
    `${quote.quantity} ${quote.materialId}, ${side}: ${price}, ${quote.direction === "Sell" ? `trader has ${quote.available} coins` : `${quote.available} available`}`,
  ];
}
