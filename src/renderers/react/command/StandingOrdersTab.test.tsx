// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- tests read typed views out of query JSON */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { StandingOrderView } from "../../../game/standing/standingViews";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";
import { StandingOrderForm, useRecipesMaking } from "./StandingOrdersTab";

afterEach(cleanup);

function open(app: RenderedApp): void {
  act(() => {
    app.host.navigation.navigate(Screen.StandingOrders);
  });
  fireEvent.click(screen.getByRole("tab", { name: "Standing orders" }));
}

function step(app: RenderedApp): void {
  act(() => {
    app.host.step(1);
  });
}

function orders(app: RenderedApp): readonly StandingOrderView[] {
  const result = app.host.store.query("standing-orders", {});
  return result.ok ? (result.data as unknown as readonly StandingOrderView[]) : [];
}

describe("useRecipesMaking", () => {
  it("finds the recipes that make a material and none for an empty or unknown one", () => {
    const host = new EngineHost();
    host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
    const { result, rerender } = renderHook(
      (props: { material: string }) => useRecipesMaking(props.material),
      {
        initialProps: { material: "bread" },
        wrapper: (props: { children: ReactNode }) =>
          createElement(EngineProvider, { host, children: props.children }),
      },
    );
    expect(result.current.map((recipe) => recipe.id)).toContain("bake_bread");
    rerender({ material: "" });
    expect(result.current).toEqual([]);
    rerender({ material: "no_such_material" });
    expect(result.current).toEqual([]);
  });
});

describe("StandingOrdersTab", () => {
  // @covers 024:FR-029
  it("creates a standing order with the Keep in stock form, then edits, pauses and deletes it", () => {
    const app = renderApp();
    app.start();
    open(app);
    const form = screen.getByRole("form", { name: "Keep in stock" });
    fireEvent.change(within(form).getByLabelText("Material"), { target: { value: "bread" } });
    fireEvent.change(within(form).getByLabelText("Keep this many"), { target: { value: "20" } });
    fireEvent.change(within(form).getByLabelText("Priority"), { target: { value: "80" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create standing order" }));
    step(app);
    expect(orders(app)).toEqual([
      expect.objectContaining({ materialId: "bread", targetQuantity: 20, priority: 80 }),
    ]);
    const orderId = orders(app)[0]?.orderId ?? 0;
    expect(screen.getByText(`#${orderId} bread`)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(`Target of order ${orderId}`), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    step(app);
    expect(orders(app)[0]?.targetQuantity).toBe(30);

    fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Pause" }));
    step(app);
    expect(orders(app)[0]?.paused).toBe(true);
    fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Resume" }));
    step(app);
    expect(orders(app)[0]?.paused).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    step(app);
    expect(orders(app)).toHaveLength(0);
  });

  it("shows field errors without sending anything for a bad form", () => {
    const app = renderApp();
    app.start();
    open(app);
    const form = screen.getByRole("form", { name: "Keep in stock" });
    fireEvent.click(within(form).getByRole("button", { name: "Create standing order" }));
    expect(within(form).getByText("Choose a material")).toBeTruthy();
    expect(within(form).getByText("Enter a whole number")).toBeTruthy();
    step(app);
    expect(orders(app)).toHaveLength(0);
  });

  it("asks for a recipe when several make the material and creates the order with the choice", () => {
    const app = renderApp();
    app.start();
    open(app);
    const form = screen.getByRole("form", { name: "Keep in stock" });
    fireEvent.change(within(form).getByLabelText("Material"), { target: { value: "bread" } });
    expect(within(form).queryByLabelText(/Recipe/)).toBeNull();
    fireEvent.change(within(form).getByLabelText("Material"), { target: { value: "flour" } });
    const select = within(form).getByLabelText(/Recipe/);
    const choices = within(select).getAllByRole("option");
    expect(choices.length).toBeGreaterThan(2);
    const chosen = (choices[1] as HTMLOptionElement).value;
    fireEvent.change(select, { target: { value: chosen } });
    fireEvent.change(within(form).getByLabelText("Keep this many"), { target: { value: "40" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create standing order" }));
    step(app);
    expect(orders(app)).toEqual([
      expect.objectContaining({ materialId: "flour", recipeId: chosen }),
    ]);
  });

  // @covers 024:FR-030
  it("prefills the material of a Keep in stock action elsewhere", () => {
    const host = new EngineHost();
    host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
    render(
      <EngineProvider host={host}>
        <StandingOrderForm initialMaterialId="flour" />
      </EngineProvider>,
    );
    expect((screen.getByLabelText("Material") as HTMLInputElement).value).toBe("flour");
    fireEvent.change(screen.getByLabelText("Recipe (several make this)"), {
      target: { value: "grind_flour" },
    });
    fireEvent.change(screen.getByLabelText("Keep this many"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Create standing order" }));
    act(() => {
      host.step(1);
    });
    const result = host.store.query("standing-orders", {});
    expect(result.ok && Array.isArray(result.data) ? result.data.length : 0).toBe(1);
  });
});
/* eslint-enable no-restricted-syntax -- end of the test file */
