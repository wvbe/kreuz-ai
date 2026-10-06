// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Screen } from "./navigation/Screen";
import { renderApp } from "./testing/renderApp";

afterEach(cleanup);

describe("AppShell", () => {
  it("disables the game screens until a game exists", () => {
    renderApp();
    expect((screen.getByRole("button", { name: "Map" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "New game" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((screen.getByRole("button", { name: "Settings" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  // @covers 024:FR-022
  it("routes between every screen of spec 024 without a reload", () => {
    const app = renderApp();
    app.start();
    for (const [label, heading] of [
      ["Content", "Content browser"],
      ["Chronicle", "Chronicle"],
      ["Flow", "Production flow"],
      ["Idle and blocked", "Idle and blocked"],
      ["Government", "Government"],
      ["Settings", "Settings"],
      ["New game", "New game"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(screen.getByTestId("map-canvas")).toBeTruthy();
  });

  it("lets any code navigate through the host and shows the screen", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.navigation.navigate(Screen.Flow);
    });
    expect(screen.getByRole("heading", { name: "Production flow" })).toBeTruthy();
  });

  it("shows toasts and dismisses them", () => {
    const app = renderApp();
    act(() => {
      app.host.dispatch({ kind: "nonsense" });
    });
    expect(screen.getByText(/nonsense/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/nonsense/)).toBeNull();
  });

  // @covers 026:SC-008 024:FR-030
  it("creates a standing order in three interactions from a material in an inventory row", () => {
    const app = renderApp();
    app.start();
    const peasant = app.host.session.query.entities({ prototype: "peasant", limit: 1 }).entities[0];
    act(() => {
      app.host.selection.selectEntity(peasant?.id ?? 0, null);
    });
    fireEvent.click(screen.getByRole("tab", { name: "Inventory" }));
    // interaction 1: the action on the bread row
    fireEvent.click(screen.getByRole("button", { name: "Keep bread in stock" }));
    expect(app.host.navigation.getSnapshot().screen).toBe(Screen.StandingOrders);
    // interaction 2: the target, interaction 3: submit
    fireEvent.change(screen.getByLabelText("Keep this many"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Create standing order" }));
    act(() => {
      app.host.step(1);
    });
    const orders = app.host.store.query("standing-orders", {});
    expect(orders.ok && JSON.stringify(orders.data)).toContain('"materialId":"bread"');
  });
});

describe("AppShell accessibility", () => {
  const roles = [
    "button",
    "textbox",
    "searchbox",
    "checkbox",
    "combobox",
    "spinbutton",
    "radio",
    "slider",
    "tab",
    "link",
  ] as const;

  function unnamed(): string[] {
    return roles.flatMap((role) => {
      const all = screen.queryAllByRole(role).length;
      const named = screen.queryAllByRole(role, { name: /\S/ }).length;
      return all === named ? [] : [`${role}: ${all - named} without an accessible name`];
    });
  }

  // @covers 024:FR-001
  it("gives every interactive control of every screen an accessible name", () => {
    const app = renderApp();
    expect(unnamed()).toEqual([]);
    app.start();
    const citizen = app.host.session.query.entities({ prototype: "peasant", limit: 1 }).entities[0];
    act(() => {
      app.host.selection.selectEntity(citizen?.id ?? 0, null);
    });
    let controls = 0;
    for (const target of Object.values(Screen)) {
      act(() => {
        app.host.navigation.navigate(target);
      });
      controls += roles.reduce((sum, role) => sum + screen.queryAllByRole(role).length, 0);
      expect(unnamed(), `screen ${target}`).toEqual([]);
      for (const tab of screen.queryAllByRole("tab")) {
        fireEvent.click(tab);
        expect(unnamed(), `screen ${target}, tab ${tab.textContent ?? ""}`).toEqual([]);
      }
    }
    // the audit looked at real controls, not at an empty page
    expect(controls).toBeGreaterThan(50);
  });
});
