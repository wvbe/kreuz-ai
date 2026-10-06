import { useState } from "react";
import type { TradeQuote } from "../../../game/trade/tradeQuotes";
import type {
  LedgerView,
  OrderView,
  TraderView,
  TradersView,
  TreasuryView,
} from "../../../game/trade/tradeViews";
import { parseWhole, tradeCommand, TradeSide } from "./commandPayloads";
import { FormError, FormField } from "./FormField";
import { useSender } from "./useSender";
import { useView } from "./useView";

/**
 * The text of a quote: the price, or why the trader will not trade.
 *
 * @param quote - A `trade-quote` view.
 * @returns One line.
 */
export function describeQuote(quote: TradeQuote): string {
  if (quote.reason !== null) {
    return `Not possible: ${quote.reason}`;
  }
  const price =
    quote.coins === null
      ? "no value"
      : quote.ceilingCoins !== null && quote.ceilingCoins !== quote.coins
        ? `${quote.coins} coins (up to ${quote.ceilingCoins} after a counter)`
        : `${quote.coins} coins`;
  return `${quote.quantity} ${quote.materialId}: ${price}; ${quote.available} available`;
}

function TradeForm(props: { traders: readonly TraderView[] }) {
  const sender = useSender();
  const [side, setSide] = useState(TradeSide.Sell);
  const [traderId, setTraderId] = useState(String(props.traders[0]?.entityId ?? ""));
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const trader = props.traders.find((entry) => String(entry.entityId) === traderId);
  const wanted = parseWhole(quantity);
  const quote = useView<TradeQuote | null>(
    "trade-quote",
    trader === undefined || materialId.trim() === "" || wanted === null || wanted < 1
      ? { traderId: 0, direction: side, materialId: "x", quantity: 1 }
      : {
          traderId: trader.entityId,
          direction: side,
          materialId: materialId.trim(),
          quantity: wanted,
        },
  );
  const quoted = trader !== undefined && materialId.trim() !== "" && wanted !== null && wanted >= 1;
  return (
    <form
      className="kv-form"
      aria-label="Trade"
      onSubmit={(event) => {
        event.preventDefault();
        sender.sendForm(tradeCommand({ side, traderId, materialId, quantity }));
      }}
    >
      <FormField label="Direction">
        <select value={side} onChange={(event) => setSide(event.target.value as TradeSide)}>
          <option value={TradeSide.Sell}>Sell to the trader</option>
          <option value={TradeSide.Buy}>Buy from the trader</option>
        </select>
      </FormField>
      <FormField label="Trader" error={sender.errors["traderId"]}>
        <select value={traderId} onChange={(event) => setTraderId(event.target.value)}>
          {props.traders.map((entry) => (
            <option key={entry.entityId} value={entry.entityId}>
              {entry.prototypeId} #{entry.entityId}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Goods" error={sender.errors["materialId"]}>
        <input
          list="kv-trade-goods"
          value={materialId}
          onChange={(event) => setMaterialId(event.target.value)}
        />
        <datalist id="kv-trade-goods">
          {(side === TradeSide.Sell
            ? (trader?.buys ?? [])
            : (trader?.stock.map((item) => item.materialId) ?? [])
          ).map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
      </FormField>
      <FormField label="Quantity" error={sender.errors["quantity"]}>
        <input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </FormField>
      {quoted && quote !== null ? <p data-testid="trade-quote">{describeQuote(quote)}</p> : null}
      <FormError message={sender.errors[""]} />
      <button type="submit">{side === TradeSide.Sell ? "Sell" : "Buy"}</button>
    </form>
  );
}

/**
 * The trade tab: the treasury, the refined-credit ledger, the traders on the map with stock and
 * standing, a sell or buy form with a live quote (`trade-quote`) and the open orders with cancel.
 * There is no trade-policy screen by owner decision.
 *
 * @returns The tab.
 */
export function TradeTab() {
  const sender = useSender();
  const traders = useView<TradersView>("traders", {});
  const treasury = useView<TreasuryView>("treasury", {});
  const ledger = useView<readonly LedgerView[]>("trade-ledger", {}) ?? [];
  const orders = useView<readonly OrderView[]>("trade-orders", {}) ?? [];
  const present = traders?.traders ?? [];
  return (
    <div className="kv-trade">
      <p>
        Treasury: <strong>{treasury?.balance ?? 0}</strong> coins
        {treasury !== null && treasury.pendingWages.length > 0
          ? `; ${treasury.pendingWages.length} wages wait for coins`
          : ""}
      </p>
      <h4>Traders</h4>
      {present.length === 0 ? (
        <p>
          No trader is here
          {traders?.visits[0]?.nextArrivalTick === undefined
            ? "."
            : `; the next arrives at tick ${traders.visits[0].nextArrivalTick}.`}
        </p>
      ) : (
        <ul>
          {present.map((trader) => (
            <li key={trader.entityId}>
              {trader.prototypeId} #{trader.entityId}: {trader.coins} coins, standing{" "}
              {trader.standing}; buys {trader.buys.join(", ") || "nothing"}; sells{" "}
              {trader.stock.map((item) => `${item.quantity} ${item.materialId}`).join(", ") ||
                "nothing"}
            </li>
          ))}
        </ul>
      )}
      {present.length === 0 ? null : <TradeForm key={present.length} traders={present} />}
      <h4>Orders</h4>
      {orders.length === 0 ? <p>No trade orders.</p> : null}
      <ul>
        {orders.map((order) => (
          <li key={order.orderId} data-trade-order={order.orderId}>
            #{order.orderId} {order.direction} {order.remaining}/{order.quantity} {order.materialId}
            : {order.status}
            {order.reason === null ? "" : ` (${order.reason})`}{" "}
            <button
              type="button"
              onClick={() => sender.send({ kind: "CancelTradeOrder", orderId: order.orderId })}
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
      <h4>Refined credit</h4>
      {ledger.length === 0 ? <p>No credit yet.</p> : null}
      <ul>
        {ledger.map((entry) => (
          <li key={`${entry.traderPrototypeId}-${entry.refinedMaterialId}`}>
            {entry.traderPrototypeId}: {entry.units} {entry.refinedMaterialId} may still be bought
          </li>
        ))}
      </ul>
      <FormError message={sender.errors[""]} />
    </div>
  );
}
