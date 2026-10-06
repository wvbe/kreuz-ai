// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createScenarioSession } from "../../../game/api/scenario/createScenarioSession";
import type { GameSession } from "../../../game/api/GameSession";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";

afterEach(cleanup);

function firstOf(session: GameSession, prototype: string): number {
  const found = session.query.entities({ prototype, limit: 1 }).entities[0];
  if (found === undefined) {
    throw new Error(`no ${prototype}`);
  }
  return found.id;
}

function select(app: RenderedApp, entityId: number): void {
  act(() => {
    app.host.selection.selectEntity(entityId, null);
  });
}

function spawn(
  session: GameSession,
  prototypeId: string,
  cells: number[],
  overrides?: { [component: string]: { [field: string]: string } },
): void {
  const result = session.dispatch({
    kind: "DebugSpawn",
    prototypeId,
    mapId: 1,
    cells,
    ...(overrides === undefined ? {} : { overrides }),
  });
  expect(result.ok).toBe(true);
}

/**
 * The room of scenarios/why-flow.json: walls, a door, an oven, a mill and a bakery zone, with a
 * bake order that waits for flour and a grind order that waits for wheat (no chest).
 */
function blockedBakery(): { app: RenderedApp; oven: number; mill: number; zone: number } {
  const session = createScenarioSession();
  const app = renderApp({ session });
  act(() => {
    app.host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "village" });
  });
  spawn(session, "wall", [297, 298, 329, 353, 355, 385]);
  spawn(session, "door", [325]);
  spawn(session, "oven", [326]);
  spawn(session, "grinding_mill", [324]);
  spawn(session, "chest", [295]);
  const designated = session.dispatch({
    kind: "DesignateZone",
    zoneTypeId: "bakery",
    mapId: 1,
    cells: [326, 327, 328, 354],
  });
  expect(designated.ok).toBe(true);
  act(() => {
    app.host.step(3);
  });
  session.dispatch({ kind: "CreateProductionOrder", recipeId: "bake_bread", quantity: 4 });
  session.dispatch({ kind: "CreateProductionOrder", recipeId: "grind_flour", quantity: 4 });
  act(() => {
    app.host.step(40);
  });
  return {
    app,
    oven: firstOf(session, "oven"),
    mill: firstOf(session, "grinding_mill"),
    zone: firstOf(session, "zone"),
  };
}

describe("InspectionPanel: characters", () => {
  it("shows name, status line, needs, skills, traits and factions of a citizen", () => {
    const app = renderApp();
    app.start();
    const peasant = firstOf(app.host.session, "peasant");
    select(app, peasant);
    const identity = app.host.session.query.run("identity-of", { entityId: peasant });
    const name = identity.ok ? (identity.data as { styledName: string }).styledName : "";
    const panel = screen.getByRole("complementary", { name: "Panels" });
    expect(within(panel).getByRole("heading", { name })).toBeTruthy();
    expect(within(panel).getByText("Idle")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "why?" })).toBeTruthy();
    expect(within(panel).getByRole("meter", { name: "Hunger" }).getAttribute("aria-valuenow")).toBe(
      "80",
    );
    expect(within(panel).getByText(/Farming 5/)).toBeTruthy();
    expect(within(panel).getByText(/Slow learner/)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Settlement" })).toBeTruthy();
  });

  it("lists the inventory with weights and the journal with a link to the chronicle", () => {
    const app = renderApp();
    app.start();
    const peasant = firstOf(app.host.session, "peasant");
    select(app, peasant);
    fireEvent.click(screen.getByRole("tab", { name: "Inventory" }));
    expect(screen.getByText(/Bread x2/)).toBeTruthy();
    expect(screen.getByText(/Slots 1 of 8/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Journal" }));
    expect(screen.getByText(/has come to the hamlet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the chronicle" }));
    expect(app.host.navigation.getSnapshot().screen).toBe("chronicle");
  });
});

describe("InspectionPanel: the why popover", () => {
  it("shows the primary reason first and follows the cause chain by clicking its subjects", () => {
    const { app, oven, mill } = blockedBakery();
    select(app, oven);
    const status = document.querySelector('.kv-status[data-state="Blocked"]');
    expect(status?.textContent).toContain("Blocked: Missing input: flour (needs 1, has 0)");
    fireEvent.click(screen.getByRole("button", { name: "why?" }));
    const popover = screen.getByRole("dialog", { name: "Why?" });
    const chain = within(popover).getByRole("list", { name: "Cause chain" });
    expect(within(chain).getByText(/Missing input: wheat/)).toBeTruthy();
    fireEvent.click(within(chain).getByRole("button", { name: `Workstation #${mill}` }));
    expect(app.host.selection.getSnapshot().entityId).toBe(mill);
    expect(screen.getByRole("heading", { name: /grinding mill/i })).toBeTruthy();
  });

  it("shows the zone requirement checklist and its stored goods", () => {
    const { app, zone } = blockedBakery();
    select(app, zone);
    expect(screen.getByRole("heading", { name: /Bakery zone/i })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText(/At least 4 tiles/)).toBeTruthy();
    expect(screen.getByText("No storage in this zone.")).toBeTruthy();
  });
});

function dwellingRoom(withBed: boolean): { app: RenderedApp; zone: number } {
  const session = createScenarioSession();
  const app = renderApp({ session });
  act(() => {
    app.host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "village" });
  });
  spawn(session, "wall", [297, 298, 329, 353, 355, 385]);
  spawn(session, "door", [325]);
  if (withBed) {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- component names are PascalCase
    spawn(session, "furniture_piece", [326], { Furniture: { furnitureId: "wooden_bed" } });
  }
  const designated = session.dispatch({
    kind: "DesignateZone",
    zoneTypeId: "dwelling",
    mapId: 1,
    cells: [326, 327, 328, 354],
  });
  expect(designated.ok).toBe(true);
  act(() => {
    app.host.step(5);
  });
  return { app, zone: firstOf(session, "zone") };
}

describe("InspectionPanel: dwellings", () => {
  it("shows the level, the streaks and the requirement checklists of a dwelling", () => {
    const { app, zone } = dwellingRoom(true);
    select(app, zone);
    expect(screen.getByRole("heading", { name: /^Dwelling:/ })).toBeTruthy();
    expect(screen.getByText("Upgrade streak")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^To keep/ })).toBeTruthy();
    expect(document.querySelectorAll(".kv-checklist li").length).toBeGreaterThan(0);
  });

  it("falls back to the zone view, with its open requirement, while the room is incomplete", () => {
    const { app, zone } = dwellingRoom(false);
    select(app, zone);
    expect(screen.getByRole("heading", { name: /Dwelling zone/i })).toBeTruthy();
    const open = screen.getByText(/1 bed/).closest("li");
    expect(open?.getAttribute("data-met")).toBe("false");
  });
});

describe("InspectionPanel: tiles and objects", () => {
  it("shows terrain, move cost, buildable and the occupants of a selected tile", () => {
    const app = renderApp();
    app.start();
    const chest = app.host.session.query.entity(firstOf(app.host.session, "chest"));
    const position = chest?.components["Position"] as { mapId: number; cellIndex: number };
    act(() => {
      app.host.selection.setActiveMap(position.mapId);
      app.host.selection.selectCell(position.cellIndex);
    });
    expect(screen.getByRole("heading", { name: `Tile ${position.cellIndex}` })).toBeTruthy();
    expect(screen.getByText("Move cost")).toBeTruthy();
    expect(screen.getByText("Buildable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /chest/i }));
    expect(app.host.selection.getSnapshot().entityId).toBe(chest?.id);
    expect(screen.getByText("Contents")).toBeTruthy();
    expect(screen.getByText(/Oak plank/)).toBeTruthy();
  });
});
