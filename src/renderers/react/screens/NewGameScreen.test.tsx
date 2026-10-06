// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../testing/renderApp";

afterEach(cleanup);

describe("NewGameScreen", () => {
  it("starts with the chosen map size and tier and leaves the game paused", () => {
    const app = renderApp();
    fireEvent.change(screen.getByLabelText(/Map size/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/Starting tier/), { target: { value: "village" } });
    fireEvent.click(screen.getByLabelText(/Peaceful/));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(app.host.session.query.state()).toMatchObject({
      difficulty: "peaceful",
      startingTier: "village",
    });
    expect(app.host.session.query.maps().maps[0]?.cellCount).toBe(1200);
    expect(app.host.session.query.time().paused).toBe(true);
  });

  it("does not start with an invalid seed", () => {
    const app = renderApp();
    fireEvent.change(screen.getByLabelText("Seed"), { target: { value: "-5" } });
    fireEvent.submit(
      screen.getByRole("button", { name: "Start game" }).closest("form") as HTMLFormElement,
    );
    expect(app.host.session.hasGame).toBe(false);
  });
});
