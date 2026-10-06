// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax, @typescript-eslint/naming-convention -- tests read typed views out of query JSON and spawn prototypes with component-name overrides */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OrderView } from "../../../game/production/productionViews";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";

afterEach(cleanup);

function orders(app: RenderedApp): readonly OrderView[] {
  const result = app.host.store.query("production-orders", {});
  return result.ok ? (result.data as unknown as readonly OrderView[]) : [];
}

function step(app: RenderedApp): void {
  act(() => {
    app.host.step(1);
  });
}

function open(app: RenderedApp): HTMLElement {
  act(() => {
    app.host.navigation.navigate(Screen.StandingOrders);
  });
  fireEvent.click(screen.getByRole("tab", { name: "Production orders" }));
  return screen.getByRole("tabpanel");
}

describe("ProductionTab", () => {
  it("says a workstation is needed when there is none", () => {
    const app = renderApp();
    app.start();
    const panel = open(app);
    expect(within(panel).getByText("Build a workstation to create orders.")).toBeTruthy();
  });

  it("creates an order from the recipes of a workstation, then pauses, reprioritises and cancels it", () => {
    const app = renderApp();
    app.start();
    app.host.session.engine.store.spawn("grinding_mill", {
      Position: { mapId: 1, cellIndex: 300 },
    });
    step(app);
    const panel = open(app);
    const form = within(panel).getByRole("form", { name: "New production order" });
    fireEvent.change(within(form).getByLabelText("Recipe"), { target: { value: "grind_flour" } });
    fireEvent.change(within(form).getByLabelText("Quantity"), { target: { value: "3" } });
    fireEvent.change(within(form).getByLabelText("Priority"), { target: { value: "40" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create order" }));
    step(app);
    expect(orders(app)).toEqual([
      expect.objectContaining({
        recipeId: "grind_flour",
        quantity: 3,
        priority: 40,
        status: "active",
      }),
    ]);
    const orderId = orders(app)[0]?.orderId ?? 0;

    fireEvent.click(within(panel).getByRole("button", { name: "Pause" }));
    step(app);
    expect(orders(app)[0]?.status).toBe("paused");
    fireEvent.click(within(panel).getByRole("button", { name: "Resume" }));
    step(app);
    expect(orders(app)[0]?.status).toBe("active");

    fireEvent.change(within(panel).getByLabelText(`Priority of order ${orderId}`), {
      target: { value: "90" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Set priority" }));
    step(app);
    expect(orders(app)[0]?.priority).toBe(90);

    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    step(app);
    expect(orders(app).filter((order) => order.status === "active")).toHaveLength(0);
  });

  it("shows field errors for an incomplete order", () => {
    const app = renderApp();
    app.start();
    app.host.session.engine.store.spawn("oven", { Position: { mapId: 1, cellIndex: 300 } });
    step(app);
    const panel = open(app);
    fireEvent.click(within(panel).getByRole("button", { name: "Create order" }));
    expect(within(panel).getByRole("alert").textContent).toBe("Choose a recipe");
    step(app);
    expect(orders(app)).toHaveLength(0);
  });
});
/* eslint-enable no-restricted-syntax, @typescript-eslint/naming-convention -- end of the test file */
