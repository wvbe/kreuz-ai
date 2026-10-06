// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "./testing/renderApp";

afterEach(cleanup);

describe("App", () => {
  it("starts on the new-game screen with the three difficulties and Steady selected", () => {
    renderApp();
    expect(screen.getByText("Kreuzvibe")).toBeTruthy();
    const steady = screen.getByLabelText(/Steady/) as HTMLInputElement;
    expect(steady.checked).toBe(true);
    expect(screen.getByLabelText(/Peaceful/)).toBeTruthy();
    expect(screen.getByLabelText(/Harsh/)).toBeTruthy();
    expect(screen.getByText(/Cosy: food keeps longer/)).toBeTruthy();
  });

  it("starts a game from the form, shows the map paused and ticks with the clock", () => {
    const app = renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(app.host.session.hasGame).toBe(true);
    expect(app.host.session.query.state().seed).toBe(42);
    expect(screen.getByTestId("map-canvas").getAttribute("data-cells")).toBe("600");
    expect(app.host.session.query.time().paused).toBe(true);
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    act(() => {
      app.fake.fireMany(3);
    });
    expect(app.host.session.tick).toBe(3);
    expect(screen.getByText(/tick 3/)).toBeTruthy();
  });

  it("rejects an invalid seed and honours the chosen difficulty", () => {
    const app = renderApp();
    const seed = screen.getByLabelText("Seed");
    fireEvent.change(seed, { target: { value: "abc" } });
    expect((screen.getByRole("button", { name: "Start game" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/whole number/);
    fireEvent.change(seed, { target: { value: "7" } });
    fireEvent.click(screen.getByLabelText(/Harsh/));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(app.host.session.query.state()).toMatchObject({ seed: 7, difficulty: "harsh" });
  });

  it("fills the seed field from the random button", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Random seed" }));
    const value = (screen.getByLabelText("Seed") as HTMLInputElement).value;
    expect(Number(value)).toBeGreaterThanOrEqual(0);
    expect(/^\d+$/.test(value)).toBe(true);
  });
});
