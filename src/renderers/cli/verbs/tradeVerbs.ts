import {
  formatLedger,
  formatOffers,
  formatOrders,
  formatQuote,
  formatTraders,
  formatTreasury,
} from "../formatTrade";
import { parseCount, verbDone, verbFailed } from "./Verb";
import type { Verb, VerbContext, VerbOutput } from "./Verb";
import type { JsonValue } from "../../../game/engine/EventBus";

const tradeUsage =
  "usage: trade sell|buy <traderId> <materialId> <quantity> | trade orders | trade offers | trade quote sell|buy <traderId> <materialId> [quantity] | trade cancel <orderId>";

function show(
  context: VerbContext,
  name: string,
  args: { [name: string]: string | number },
  format: (view: JsonValue) => string[],
  failure: string,
): VerbOutput {
  const result = context.session.query.run(name, args);
  return result.ok ? verbDone(format(result.data)) : verbFailed(failure);
}

function queue(
  context: VerbContext,
  command: { kind: string; [name: string]: string | number },
  done: string,
): VerbOutput {
  const result = context.session.dispatch(command);
  return result.ok
    ? verbDone([`queued ${command.kind}: ${done} (applied on the next tick)`])
    : verbFailed(`${result.error.kind}: ${result.error.message}`);
}

enum TradeSide {
  Sell = "Sell",
  Buy = "Buy",
}

function direction(text: string | undefined): TradeSide | null {
  return text === "sell" ? TradeSide.Sell : text === "buy" ? TradeSide.Buy : null;
}

/**
 * Trade verbs (spec 019, D-13, D-55): `traders`, `trade`, `treasury`, `ledger`. The player trades
 * through orders: settlers carry the goods and the coins; `trade sell` and `trade buy` queue
 * `TradeSell` / `TradeBuy`, the other forms read the trade queries.
 */
export const tradeVerbs: readonly Verb[] = [
  {
    name: "traders",
    usage: "traders",
    summary:
      "the travelling traders on the map (stock, coins, what they buy, standing) and when each kind comes next",
    run: (args, context) =>
      args.length > 0
        ? verbFailed("usage: traders")
        : show(context, "traders", {}, formatTraders, "the traders are not available (no game?)"),
  },
  {
    name: "trade",
    usage:
      "trade sell|buy <traderId> <materialId> <quantity> | trade orders|offers|quote|cancel ...",
    summary:
      "order settlers to sell goods to a trader or buy goods from it; list the orders and offers, quote a price, cancel an order",
    run: (args, context) => {
      const [sub, first, second, third] = args;
      const side = direction(sub);
      if (side !== null) {
        const traderId = parseCount(first);
        const quantity = parseCount(third);
        if (traderId === null || second === undefined || quantity === null || args.length !== 4) {
          return verbFailed(tradeUsage);
        }
        return queue(
          context,
          {
            kind: side === TradeSide.Sell ? "TradeSell" : "TradeBuy",
            traderId,
            materialId: second,
            quantity,
          },
          `${side === TradeSide.Sell ? "sell" : "buy"} ${quantity} ${second} with trader #${traderId}`,
        );
      }
      if (sub === "orders" && args.length === 1) {
        return show(
          context,
          "trade-orders",
          {},
          formatOrders,
          "the orders are not available (no game?)",
        );
      }
      if (sub === "offers" && args.length === 1) {
        return show(
          context,
          "trade-offers",
          {},
          formatOffers,
          "the offers are not available (no game?)",
        );
      }
      if (sub === "cancel" && args.length === 2) {
        const orderId = parseCount(first);
        return orderId === null
          ? verbFailed(tradeUsage)
          : queue(context, { kind: "CancelTradeOrder", orderId }, `cancel order #${orderId}`);
      }
      if (sub === "quote") {
        const quoteSide = direction(first);
        const traderId = parseCount(second);
        const quantity = args[4] === undefined ? 1 : parseCount(args[4]);
        if (
          quoteSide === null ||
          traderId === null ||
          third === undefined ||
          quantity === null ||
          quantity < 1 ||
          args.length > 5
        ) {
          return verbFailed(tradeUsage);
        }
        return show(
          context,
          "trade-quote",
          { traderId, direction: quoteSide, materialId: third, quantity },
          formatQuote,
          "no quote (no game?)",
        );
      }
      return verbFailed(tradeUsage);
    },
  },
  {
    name: "treasury",
    usage: "treasury",
    summary: "the coins in the settlement treasury and the wages that wait for coins",
    run: (args, context) =>
      args.length > 0
        ? verbFailed("usage: treasury")
        : show(context, "treasury", {}, formatTreasury, "the treasury is not available (no game?)"),
  },
  {
    name: "ledger",
    usage: "ledger",
    summary:
      "the refined credit: how many refined goods the traders may still sell to the settlement",
    run: (args, context) =>
      args.length > 0
        ? verbFailed("usage: ledger")
        : show(context, "trade-ledger", {}, formatLedger, "the ledger is not available (no game?)"),
  },
];
