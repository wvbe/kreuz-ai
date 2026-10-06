import { act, render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { createScenarioSession } from "../../../game/api/scenario/createScenarioSession";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { createFakeScheduler } from "./fakeScheduler";

/**
 * A host over a scenario session (which accepts `DebugSpawn`) with a new game (seed 42, Steady,
 * Small) started, driven by a hand-driven scheduler.
 *
 * @param startingTier - The tier to start in (default `hamlet`; `village` unlocks more content).
 * @returns The host.
 */
export function startedHost(startingTier = "hamlet"): EngineHost {
  const host = new EngineHost({
    session: createScenarioSession(),
    scheduler: createFakeScheduler().scheduler,
  });
  act(() => {
    host.newGame({ seed: 42, difficulty: "steady", mapSize: 0, startingTier });
  });
  return host;
}

/**
 * Renders one component (a panel, a widget) inside the engine provider of a host.
 *
 * @param element - What to render.
 * @param host - The host the component reads, usually from {@link startedHost}.
 * @returns The render result.
 */
export function renderPanel(element: ReactElement, host: EngineHost): RenderResult {
  return render(<EngineProvider host={host}>{element}</EngineProvider>);
}

/**
 * The id of the first entity of a prototype.
 *
 * @param host - The host with a game.
 * @param prototype - The prototype id, for example `peasant`.
 * @returns The entity id.
 */
export function firstEntityOf(host: EngineHost, prototype: string): number {
  const found = host.session.query.entities({ prototype, limit: 1 }).entities[0];
  if (found === undefined) {
    throw new Error(`the game has no ${prototype}`);
  }
  return found.id;
}

function spawn(
  host: EngineHost,
  prototypeId: string,
  cells: number[],
  overrides?: { [component: string]: { [field: string]: string } },
): void {
  const result = host.session.dispatch({
    kind: "DebugSpawn",
    prototypeId,
    mapId: 1,
    cells,
    ...(overrides === undefined ? {} : { overrides }),
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
}

function designate(host: EngineHost, zoneTypeId: string): void {
  const result = host.session.dispatch({
    kind: "DesignateZone",
    zoneTypeId,
    mapId: 1,
    cells: [326, 327, 328, 354],
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
}

/**
 * The room of `scenarios/why-flow.json` (walls, a door, an oven, a mill, a chest and a bakery
 * zone) with a bake order that waits for flour and a grind order that waits for wheat: the oven
 * is blocked because of the mill, the mill because there is no wheat.
 *
 * @param host - A host from {@link startedHost} in the `village` tier.
 * @returns The ids of the oven, the mill and the zone.
 */
export function buildBlockedBakery(host: EngineHost): { oven: number; mill: number; zone: number } {
  spawn(host, "wall", [297, 298, 329, 353, 355, 385]);
  spawn(host, "door", [325]);
  spawn(host, "oven", [326]);
  spawn(host, "grinding_mill", [324]);
  spawn(host, "chest", [295]);
  designate(host, "bakery");
  act(() => {
    host.step(3);
  });
  host.session.dispatch({ kind: "CreateProductionOrder", recipeId: "bake_bread", quantity: 4 });
  host.session.dispatch({ kind: "CreateProductionOrder", recipeId: "grind_flour", quantity: 4 });
  act(() => {
    host.step(40);
  });
  return {
    oven: firstEntityOf(host, "oven"),
    mill: firstEntityOf(host, "grinding_mill"),
    zone: firstEntityOf(host, "zone"),
  };
}

/**
 * A walled four-tile room designated as a dwelling, with or without its bed.
 *
 * @param host - A host from {@link startedHost} in the `village` tier.
 * @param withBed - Whether the bed the dwelling needs stands inside.
 * @returns The zone's id.
 */
export function buildDwellingRoom(host: EngineHost, withBed: boolean): { zone: number } {
  spawn(host, "wall", [297, 298, 329, 353, 355, 385]);
  spawn(host, "door", [325]);
  if (withBed) {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- component names are PascalCase
    spawn(host, "furniture_piece", [326], { Furniture: { furnitureId: "wooden_bed" } });
  }
  designate(host, "dwelling");
  act(() => {
    host.step(5);
  });
  return { zone: firstEntityOf(host, "zone") };
}
