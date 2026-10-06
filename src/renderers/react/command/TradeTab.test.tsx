// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- tests read typed views out of query JSON */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TradeQuote } from "../../../game/trade/tradeQuotes";
import type { OrderView, TradersView } from "../../../game/trade/tradeViews";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";
import { describeQuote } from "./TradeTab";

afterEach(cleanup);

function open(app: RenderedApp): HTMLElement {
  act(() => {
    app.host.navigation.navigate(Screen.StandingOrders);
  });
  fireEvent.click(screen.getByRole("tab", { name: "Trade" }));
  return screen.getByRole("tabpanel");
}

function tradeOrders(app: RenderedApp): readonly OrderView[] {
  const result = app.host.store.query("trade-orders", {});
  return result.ok ? (result.data as unknown as readonly OrderView[]) : [];
}

describe("describeQuote", () => {
  const base: TradeQuote = {
    direction: "Sell" as TradeQuote["direction"],
    materialId: "wheat",
    quantity: 10,
    coins: 20,
    ceilingCoins: 26,
    available: 100,
    reason: null,
  };

  it("shows the price with the counter ceiling, or why the trader refuses", () => {
    expect(describeQuote(base)).toBe(
      "10 wheat: 20 coins (up to 26 after a counter); 100 available",
    );
    expect(describeQuote({ ...base, ceilingCoins: 20 })).toBe("10 wheat: 20 coins; 100 available");
    expect(describeQuote({ ...base, coins: null, ceilingCoins: null })).toContain("no value");
    expect(describeQuote({ ...base, reason: "NotInterested" })).toBe("Not possible: NotInterested");
  });
});

describe("TradeTab", () => {
  it("shows the treasury and when the next trader comes while none is here", () => {
    const app = renderApp();
    app.start();
    const panel = open(app);
    expect(within(panel).getByText("1000")).toBeTruthy();
    expect(
      within(panel).getByText(/No trader is here; the next arrives at tick \d+\./),
    ).toBeTruthy();
    expect(within(panel).getByText("No trade orders.")).toBeTruthy();
  });

  it("quotes and orders a sale to a trader that has arrived, then cancels the order", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.step(1000);
    });
    const traders = app.host.store.query("traders", {});
    const present = traders.ok ? (traders.data as unknown as TradersView).traders : [];
    expect(present.length).toBeGreaterThan(0);
    const trader = present[0];
    const wanted = trader?.buys[0] ?? "";
    expect(wanted).not.toBe("");

    const panel = open(app);
    const form = within(panel).getByRole("form", { name: "Trade" });
    fireEvent.change(within(form).getByLabelText("Goods"), { target: { value: wanted } });
    fireEvent.change(within(form).getByLabelText("Quantity"), { target: { value: "5" } });
    expect(within(form).getByTestId("trade-quote").textContent).toContain(`5 ${wanted}`);
    fireEvent.click(within(form).getByRole("button", { name: "Sell" }));
    act(() => {
      app.host.step(1);
    });
    expect(tradeOrders(app)).toEqual([
      expect.objectContaining({ direction: "Sell", materialId: wanted, quantity: 5 }),
    ]);
    expect(within(panel).getByText(new RegExp(`Sell 5/5 ${wanted}`))).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    act(() => {
      app.host.step(1);
    });
    expect(tradeOrders(app).filter((order) => order.status === "open")).toHaveLength(0);
  });

  it("shows field errors for an incomplete trade form", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.step(1000);
    });
    const panel = open(app);
    const form = within(panel).getByRole("form", { name: "Trade" });
    fireEvent.change(within(form).getByLabelText("Quantity"), { target: { value: "0" } });
    fireEvent.click(within(form).getByRole("button", { name: "Sell" }));
    expect(within(form).getByText("Must be at least 1")).toBeTruthy();
    expect(within(form).getByText("Choose goods")).toBeTruthy();
  });
});
/* eslint-enable no-restricted-syntax -- end of the test file */
