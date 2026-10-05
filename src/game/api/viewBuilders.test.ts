import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { MapSize } from "../map/mapSize";
import { GridType } from "../map/mapTypes";
import { ApiError, ApiErrorKind } from "./ApiError";
import { CommandQueue } from "./CommandQueue";
import { EventLog } from "./EventLog";
import {
  buildCellView,
  buildEntityDetailView,
  buildEntityListView,
  buildEventLogView,
  buildMapListView,
  buildMapView,
  buildPendingCommandsView,
  buildSettlementView,
  buildStateView,
  buildTimeView,
  defaultEntityListLimit,
  maxEntityListLimit,
} from "./viewBuilders";

function createEngine(): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 5 });
  engine.maps.createMap({
    gridType: GridType.Voronoi,
    terrainId: "grassland",
    size: MapSize.Small,
    seed: 5,
  });
  engine.store.spawn("peasant");
  engine.store.spawn("peasant");
  engine.store.spawn("farmer");
  return engine;
}

describe("view builders", () => {
  const engine = createEngine();

  it("buildTimeView and buildStateView describe the clock and the game", () => {
    expect(buildTimeView(engine)).toEqual(engine.getTime());
    expect(buildStateView(engine, 3)).toMatchObject({
      hasGame: true,
      seed: 5,
      difficulty: "steady",
      entityCount: 4,
      mapCount: 1,
      pendingCommandCount: 3,
    });
    const idle = new GameEngine(loadContent());
    expect(buildStateView(idle, 0)).toMatchObject({ hasGame: false, startingTier: null });
  });

  it("buildEntityListView filters and pages, hiding entities flagged for deletion", () => {
    expect(buildEntityListView(engine).total).toBe(4);
    expect(buildEntityListView(engine, { prototype: "peasant" }).entities).toEqual([
      { id: 2, prototype: "peasant" },
      { id: 3, prototype: "peasant" },
    ]);
    expect(buildEntityListView(engine, { limit: 2, offset: 3 })).toMatchObject({
      total: 4,
      offset: 3,
      entities: [{ id: 4, prototype: "farmer" }],
    });
    expect(defaultEntityListLimit).toBeLessThan(maxEntityListLimit);
    const other = createEngine();
    other.store.requestDelete(2);
    expect(buildEntityListView(other).total).toBe(3);
  });

  it("buildEntityDetailView copies the components", () => {
    const view = buildEntityDetailView(engine, 2);
    expect(view?.prototype).toBe("peasant");
    expect(Object.keys(view?.components ?? {})).toContain("Inventory");
    delete (view?.components as { [name: string]: object })["Inventory"];
    expect(Object.keys(buildEntityDetailView(engine, 2)?.components ?? {})).toContain("Inventory");
    expect(buildEntityDetailView(engine, 99)).toBeNull();
  });

  it("buildMapListView and buildMapView describe the maps", () => {
    const list = buildMapListView(engine);
    expect(list.maps).toHaveLength(1);
    const map = buildMapView(engine, 1);
    expect(map).toMatchObject({ id: 1, parentId: null, gridType: "voronoi" });
    expect(map.terrain).toHaveLength(map.cellCount);
    expect(map.centers).toHaveLength(map.cellCount);
    expect(map.extent).toEqual({ x: 65536, y: 65536 });
    expect(map.params["generator"]).toBeTypeOf("string");
    expect(() => buildMapView(engine, 9)).toThrow(ApiError);
  });

  it("buildCellView describes a cell and rejects unknown ones", () => {
    const view = buildCellView(engine, 1, 0);
    expect(view).toMatchObject({ mapId: 1, cellIndex: 0, link: null, occupants: [] });
    expect(view.moveCost).toBeGreaterThan(0);
    expect(() => buildCellView(engine, 9, 0)).toThrow(ApiError);
    try {
      buildCellView(engine, 1, 100000);
      throw new Error("expected a failure");
    } catch (failure) {
      expect(failure).toMatchObject({ kind: ApiErrorKind.NotFound });
    }
  });

  it("buildSettlementView counts humanoid entities as population", () => {
    expect(buildSettlementView(engine)).toMatchObject({
      tier: "hamlet",
      population: 3,
      entityCount: 4,
      mapCount: 1,
      day: 0,
      tick: 0,
    });
  });

  it("buildEventLogView and buildPendingCommandsView read the session buffers", () => {
    const log = new EventLog(5);
    log.push(1, "demo.a", { count: 1 });
    log.push(2, "demo.b", { count: 2 });
    expect(buildEventLogView(log)).toMatchObject({ total: 2 });
    expect(buildEventLogView(log, 1).events.map((event) => event.name)).toEqual(["demo.b"]);
    const queue = new CommandQueue();
    queue.enqueue("demo.cmd", { field: 1 }, 4);
    expect(buildPendingCommandsView(queue).commands).toEqual([
      { commandId: 1, kind: "demo.cmd", payload: { field: 1 }, tick: 4 },
    ]);
  });
});
