// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createScenarioSession } from "../../../game/api/scenario/createScenarioSession";
import { buildBlockedBakery, firstEntityOf } from "../testing/renderPanel";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";

afterEach(cleanup);

function village(): RenderedApp {
  const app = renderApp({ session: createScenarioSession() });
  act(() => {
    app.host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "village" });
  });
  return app;
}

function select(app: RenderedApp, entityId: number): void {
  act(() => {
    app.host.selection.selectEntity(entityId, null);
  });
}

describe("InspectionPanel in the dock", () => {
  it("says nothing is selected, then shows the selected citizen under its styled name", () => {
    const app = renderApp();
    app.start();
    const panel = screen.getByRole("complementary", { name: "Panels" });
    expect(within(panel).getByText("Nothing selected.")).toBeTruthy();
    const peasant = firstEntityOf(app.host, "peasant");
    select(app, peasant);
    const identity = app.host.session.query.run("identity-of", { entityId: peasant });
    const name = identity.ok ? (identity.data as { styledName: string }).styledName : "";
    expect(within(panel).getByRole("heading", { name })).toBeTruthy();
    expect(within(panel).getByText("Idle")).toBeTruthy();
    expect(within(panel).getByRole("meter", { name: "Hunger" })).toBeTruthy();
  });

  it("shows the selected tile when no entity is selected", () => {
    const app = renderApp();
    app.start();
    act(() => {
      app.host.selection.setActiveMap(1);
      app.host.selection.selectCell(12);
    });
    expect(screen.getByRole("heading", { name: "Tile 12" })).toBeTruthy();
  });
});

describe("why popover in the dock", () => {
  it("shows the primary reason first and follows the cause chain by clicking its subjects", () => {
    const app = village();
    const { oven, mill } = buildBlockedBakery(app.host);
    select(app, oven);
    const status = document.querySelector('.kv-status[data-state="Blocked"]');
    expect(status?.textContent).toContain("Blocked: Missing input: flour (needs 1, has 0)");
    fireEvent.click(screen.getByRole("button", { name: "why?" }));
    const popover = screen.getByRole("dialog", { name: "Why?" });
    const chain = within(popover).getByRole("list", { name: "Cause chain" });
    expect(within(chain).getByText(/Missing input: wheat/)).toBeTruthy();
    fireEvent.click(within(chain).getByRole("button", { name: `Workstation #${mill}` }));
    expect(app.host.selection.getSnapshot().entityId).toBe(mill);
    expect(screen.getByRole("heading", { name: "grinding mill" })).toBeTruthy();
  });
});
