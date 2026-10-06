// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { createFakeScheduler } from "../testing/fakeScheduler";
import { renderApp } from "../testing/renderApp";
import { SettlementProgressPanel, tierTitle } from "./SettlementProgressPanel";

afterEach(cleanup);

function startedHost(): EngineHost {
  const host = new EngineHost({ scheduler: createFakeScheduler().scheduler });
  host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "hamlet" });
  return host;
}

describe("SettlementProgressPanel", () => {
  it("titles tier ids", () => {
    expect(tierTitle("market_town")).toBe("Market town");
    expect(tierTitle("first-market")).toBe("First market");
  });

  // @covers 024:FR-034
  it("shows the tier, the next tier's checklist, its unlocks and the milestones", () => {
    render(
      <EngineProvider host={startedHost()}>
        <SettlementProgressPanel />
      </EngineProvider>,
    );
    expect(screen.getByText("Hamlet", { selector: "strong" })).toBeTruthy();
    const checklist = screen.getByRole("list", { name: "Next tier requirements" });
    expect(within(checklist).getAllByRole("progressbar").length).toBeGreaterThan(0);
    expect(screen.getByText("Unlocks at Village")).toBeTruthy();
    const milestones = screen.getByRole("list", { name: "Milestones" });
    expect(within(milestones).getAllByRole("listitem")).toHaveLength(7);
  });

  it("is docked beside the map", () => {
    const app = renderApp();
    app.start();
    expect(
      screen.getByLabelText("Panels").querySelector('[data-panel="settlement-progress"]')
        ?.textContent,
    ).toContain("Hamlet");
  });
});
