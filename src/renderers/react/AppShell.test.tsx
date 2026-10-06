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
});
