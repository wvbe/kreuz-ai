// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { firstEntityOf, renderPanel, startedHost } from "../testing/renderPanel";
import { within } from "@testing-library/react";
import { createScenarioSession } from "../../../game/api/scenario/createScenarioSession";
import type { WorkstationView } from "../../../game/production/productionViews";
import { Screen } from "../navigation/Screen";
import { renderApp } from "../testing/renderApp";
import type { RenderedApp } from "../testing/renderApp";
import { CitizenOverview } from "./CitizenOverview";

afterEach(cleanup);

describe("CitizenOverview", () => {
  // @covers 024:FR-007
  it("shows the action, need bars with values, skills, traits and factions", () => {
    const host = startedHost();
    renderPanel(<CitizenOverview entityId={firstEntityOf(host, "peasant")} />, host);
    expect(screen.getByText("Doing")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Rest" }).getAttribute("aria-valuenow")).toBe("80");
    expect(screen.getByRole("meter", { name: "Mood" })).toBeTruthy();
    expect(screen.getByText(/Farming 5/)).toBeTruthy();
    expect(screen.getByText(/Strong/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Settlement" }));
    expect(host.selection.getSnapshot().entityId).not.toBeNull();
  });

  // @covers 024:FR-007 024:SC-003
  it("shows the behavior tree, the zone and live values that follow the clock", () => {
    const host = startedHost();
    const id = firstEntityOf(host, "peasant");
    renderPanel(<CitizenOverview entityId={id} />, host);
    expect(screen.getByText("Behavior")).toBeTruthy();
    expect(screen.getByText("Zone")).toBeTruthy();
    const before = screen.getByRole("meter", { name: "Rest" }).getAttribute("aria-valuenow");
    act(() => {
      host.step(300);
    });
    // the panel was not re-selected: the need bar moved with the simulation
    expect(screen.getByRole("meter", { name: "Rest" }).getAttribute("aria-valuenow")).not.toBe(
      before,
    );
  });

  // @covers 024:FR-031 024:FR-038
  it("appoints the citizen as Steward, shows the office and offers Dismiss", () => {
    const host = startedHost();
    const id = firstEntityOf(host, "farmer");
    renderPanel(<CitizenOverview entityId={id} />, host);
    fireEvent.click(screen.getByRole("button", { name: "Appoint as Steward" }));
    act(() => {
      host.step(1);
    });
    expect(screen.getByText("Steward of the settlement")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    act(() => {
      host.step(1);
    });
    expect(screen.getByRole("button", { name: "Appoint as Steward" })).toBeTruthy();
    expect(screen.queryByText("Steward of the settlement")).toBeNull();
  });
});

function spawn(app: RenderedApp, prototypeId: string, cells: number[], inventory?: object[]) {
  const result = app.host.session.dispatch({
    kind: "DebugSpawn",
    prototypeId,
    mapId: 1,
    cells,
    ...(inventory === undefined ? {} : { inventory }),
  });
  expect(result.ok).toBe(true);
}

/**
 * A walled bakery room with an oven and a mill and wheat in a chest, run until somebody crafts.
 */
function bakeryWithCrafter(): { app: RenderedApp; citizen: number } {
  const app = renderApp({ session: createScenarioSession() });
  act(() => {
    app.host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier: "village" });
  });
  spawn(app, "wall", [297, 298, 329, 353, 355, 385]);
  spawn(app, "door", [325]);
  spawn(app, "oven", [326]);
  spawn(app, "grinding_mill", [324]);
  spawn(app, "chest", [295], [{ materialId: "wheat", quantity: 8 }]);
  app.host.session.dispatch({
    kind: "DesignateZone",
    zoneTypeId: "bakery",
    mapId: 1,
    cells: [326, 327, 328, 354],
  });
  act(() => {
    app.host.step(3);
  });
  app.host.session.dispatch({ kind: "CreateProductionOrder", recipeId: "bake_bread", quantity: 4 });
  app.host.session.dispatch({
    kind: "CreateProductionOrder",
    recipeId: "grind_flour",
    quantity: 4,
  });
  for (let round = 0; round < 80; round += 1) {
    act(() => {
      app.host.step(10);
    });
    const stations = app.host.session.query.run("workstations", {});
    const busy = stations.ok
      ? (stations.data as WorkstationView[]).find((row) => row.crafting !== null)
      : undefined;
    if (busy?.crafting != null) {
      return { app, citizen: busy.crafting.crafterId };
    }
  }
  throw new Error("nobody crafted within 800 ticks");
}

function inspectionPanel(): HTMLElement {
  const section = screen.getByRole("heading", { name: "Inspection" }).closest("section");
  if (section === null) {
    throw new Error("no inspection panel");
  }
  return section;
}

describe("citizen to recipe", () => {
  // @covers 024:SC-002
  it("reaches a recipe of the content browser in at most three clicks", () => {
    const { app, citizen } = bakeryWithCrafter();
    act(() => {
      app.host.selection.selectEntity(citizen, null);
      app.host.navigation.navigate(Screen.Map);
    });
    let clicks = 0;
    const click = (element: HTMLElement) => {
      clicks += 1;
      fireEvent.click(element);
    };
    const panel = inspectionPanel();
    // click 1: the workstation the citizen works at
    click(within(panel).getByRole("button", { name: /#\d+$/ }));
    expect(app.host.selection.getSnapshot().entityId).not.toBe(citizen);
    // click 2: the recipe it crafts
    const recipe = within(inspectionPanel()).getAllByRole("button", {
      name: /bake bread|grind flour/i,
    })[0];
    expect(recipe).toBeDefined();
    click(recipe as HTMLElement);
    expect(clicks).toBeLessThanOrEqual(3);
    expect(screen.getByRole("region", { name: "Content browser" })).toBeTruthy();
    expect(screen.getByRole("article", { name: /bake bread|grind flour/i })).toBeTruthy();
  });

  // @covers 024:SC-002
  it("also offers the recipe straight from the citizen (one click)", () => {
    const { app, citizen } = bakeryWithCrafter();
    act(() => {
      app.host.selection.selectEntity(citizen, null);
    });
    const panel = inspectionPanel();
    fireEvent.click(within(panel).getByTitle("Open the recipe"));
    expect(screen.getByRole("article", { name: /bake bread|grind flour/i })).toBeTruthy();
  });
});
