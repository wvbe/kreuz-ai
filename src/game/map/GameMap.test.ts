import { describe, expect, it } from "vitest";
import { EventBus } from "../engine/EventBus";
import type { GameEvent } from "../engine/EventBus";
import { GameMap, mapStateSchema } from "./GameMap";
import { MapError, MapErrorKind } from "./MapError";
import { BlockReason, GridType, MoveCostClass } from "./mapTypes";
import type { MapState } from "./mapTypes";
import { TerrainRegistry } from "./TerrainRegistry";
import { hashGeometry } from "./voronoiGeometry";

function createTerrain(): TerrainRegistry {
  const terrain = new TerrainRegistry();
  terrain.registerAll([
    { id: "grass", moveCost: MoveCostClass.Normal, passable: true, blockReason: null },
    { id: "road", moveCost: MoveCostClass.Fastest, passable: true, blockReason: null },
    { id: "marsh", moveCost: MoveCostClass.VerySlow, passable: true, blockReason: null },
    { id: "river", moveCost: MoveCostClass.Slow, passable: false, blockReason: BlockReason.Water },
    {
      id: "cliff",
      moveCost: MoveCostClass.Slow,
      passable: false,
      blockReason: BlockReason.ImpassableCliff,
    },
  ]);
  return terrain;
}

function squareState(width: number, height: number, terrainId = "grass"): MapState {
  return {
    id: 1,
    gridType: GridType.Square,
    width,
    height,
    params: { generator: "blank", seed: 0 },
    parentId: null,
    cells: Array.from({ length: width * height }, () => ({ terrain: terrainId })),
    links: [],
  };
}

function voronoiState(cellCount: number, seed: number): MapState {
  return {
    id: 2,
    gridType: GridType.Voronoi,
    params: { generator: "blank", seed, cellCount },
    parentId: null,
    cells: Array.from({ length: cellCount }, () => ({ terrain: "grass" })),
    links: [],
  };
}

function collect(bus: EventBus): GameEvent[] {
  const events: GameEvent[] = [];
  bus.subscribe("**", (_payload, event) => events.push(event));
  return events;
}

describe("mapStateSchema", () => {
  it("accepts a valid state and rejects unknown fields and bad seeds", () => {
    expect(mapStateSchema.safeParse(squareState(2, 2)).success).toBe(true);
    expect(mapStateSchema.safeParse({ ...squareState(2, 2), extra: 1 }).success).toBe(false);
    const badSeed = { ...squareState(2, 2), params: { generator: "blank", seed: -1 } };
    expect(mapStateSchema.safeParse(badSeed).success).toBe(false);
  });
});

describe("GameMap on a square grid", () => {
  const terrain = createTerrain();

  it("exposes dimensions, neighbours and coordinate sugar", () => {
    const map = new GameMap(squareState(4, 3), { terrain });
    expect(map.gridType).toBe(GridType.Square);
    expect(map.width).toBe(4);
    expect(map.height).toBe(3);
    expect(map.cellCount).toBe(12);
    expect(map.neighbors(5)).toEqual([1, 4, 6, 9]);
    expect(map.squareCell(2, 1)).toBe(6);
    expect(map.squareCoordinates(6)).toEqual({ x: 2, y: 1 });
    expect(map.centroid(6)).toEqual({ x: 2500, y: 1500 });
    expect(map.inBounds(11)).toBe(true);
    expect(map.inBounds(12)).toBe(false);
    expect(map.inBounds(-1)).toBe(false);
    expect(map.inBounds(1.5)).toBe(false);
  });

  it("counts every routing-relevant change in revision, and only real changes", () => {
    const map = new GameMap(squareState(3, 3), { terrain });
    expect(map.revision).toBe(0);
    map.setTerrain(0, "road");
    map.setTerrain(0, "road");
    expect(map.revision).toBe(1);
    map.setObstruction(1, BlockReason.Wall);
    map.setObstruction(1, BlockReason.Wall);
    expect(map.revision).toBe(2);
    map.addLink({ cell: 2, targetMapId: 9, targetCell: 0 });
    map.fill("grass");
    expect(map.revision).toBe(4);
    expect(new GameMap(map.serialize(), { terrain }).revision).toBe(0);
  });

  it("rejects out of bounds cells and coordinates", () => {
    const map = new GameMap(squareState(4, 3), { terrain });
    expect(() => map.neighbors(12)).toThrow(MapError);
    expect(() => map.terrainAt(-1)).toThrow(MapError);
    expect(() => map.squareCell(4, 0)).toThrow(MapError);
    expect(() => map.squareCell(0, 3)).toThrow(MapError);
    expect(() => map.squareCell(-1, 0)).toThrow(MapError);
    expect(() => map.squareCoordinates(99)).toThrow(MapError);
  });

  it("looks up movement cost and passability from terrain", () => {
    const map = new GameMap(squareState(3, 1), { terrain });
    map.setTerrain(1, "road");
    map.setTerrain(2, "river");
    expect(map.moveCost(0)).toBe(10);
    expect(map.moveCost(1)).toBe(5);
    expect(map.moveCost(2)).toBe(15);
    expect(map.isTraversable(0)).toBe(true);
    expect(map.isTraversable(2)).toBe(false);
    expect(map.blockReason(2)).toBe(BlockReason.Water);
    map.setTerrain(2, "cliff");
    expect(map.blockReason(2)).toBe(BlockReason.ImpassableCliff);
  });

  it("emits map.terrain.changed only when the terrain changes", () => {
    const bus = new EventBus();
    const events = collect(bus);
    const map = new GameMap(squareState(2, 2), { terrain, bus });
    expect(map.setTerrain(3, "road")).toBe(true);
    expect(map.setTerrain(3, "road")).toBe(false);
    bus.processQueue();
    expect(events).toEqual([
      {
        name: "map.terrain.changed",
        // eslint-disable-next-line id-length -- event payload field name fixed by DECISIONS section 4.2
        payload: { mapId: 1, cellIndex: 3, from: "grass", to: "road" },
      },
    ]);
    expect(() => map.setTerrain(3, "lava")).toThrowError(/unknown terrain/);
    expect(() => map.setTerrain(9, "road")).toThrow(MapError);
  });

  it("assigns a whole terrain list silently and validates it", () => {
    const bus = new EventBus();
    const events = collect(bus);
    const map = new GameMap(squareState(2, 2), { terrain, bus });
    const revision = map.revision;
    map.assignTerrain(["road", "grass", "marsh", "river"]);
    expect([0, 1, 2, 3].map((cell) => map.terrainAt(cell))).toEqual([
      "road",
      "grass",
      "marsh",
      "river",
    ]);
    expect(map.revision).toBe(revision + 1);
    bus.processQueue();
    expect(events).toEqual([]);
    expect(() => map.assignTerrain(["road"])).toThrow(MapError);
    expect(() => map.assignTerrain(["road", "road", "road", "lava"])).toThrow(MapError);
  });

  it("fills every cell silently", () => {
    const bus = new EventBus();
    const events = collect(bus);
    const map = new GameMap(squareState(2, 2), { terrain, bus });
    map.fill("marsh");
    bus.processQueue();
    expect(events).toEqual([]);
    expect([0, 1, 2, 3].map((cell) => map.terrainAt(cell))).toEqual(Array(4).fill("marsh"));
    expect(() => map.fill("lava")).toThrow(MapError);
  });

  it("obstructions block cells, terrain reasons win, and changes emit events", () => {
    const bus = new EventBus();
    const events = collect(bus);
    const map = new GameMap(squareState(2, 2), { terrain, bus });
    expect(map.setObstruction(1, BlockReason.Wall)).toBe(true);
    expect(map.setObstruction(1, BlockReason.Wall)).toBe(false);
    expect(map.isTraversable(1)).toBe(false);
    expect(map.blockReason(1)).toBe(BlockReason.Wall);
    map.setTerrain(1, "river");
    expect(map.blockReason(1)).toBe(BlockReason.Water);
    expect(map.setObstruction(1, null)).toBe(true);
    expect(map.setObstruction(1, null)).toBe(false);
    bus.processQueue();
    const topics = events.map((event) => event.name);
    expect(topics).toEqual([
      "map.cell.obstruction.changed",
      "map.terrain.changed",
      "map.cell.obstruction.changed",
    ]);
    expect(events[0]?.payload).toEqual({ mapId: 1, cellIndex: 1, traversable: false });
    expect(events[2]?.payload).toEqual({ mapId: 1, cellIndex: 1, traversable: false });
    map.setTerrain(1, "grass");
    expect(map.isTraversable(1)).toBe(true);
    expect(map.setObstruction(1, BlockReason.Locked)).toBe(true);
    expect(() => map.setObstruction(50, null)).toThrow(MapError);
  });

  it("stores links ascending and refuses duplicates", () => {
    const map = new GameMap(squareState(3, 1), { terrain });
    map.addLink({ cell: 2, targetMapId: 5, targetCell: 0 });
    map.addLink({ cell: 0, targetMapId: 6, targetCell: 1 });
    expect(map.links().map((link) => link.cell)).toEqual([0, 2]);
    expect(map.getLink(1)).toBeNull();
    expect(map.getLink(2)).toEqual({ cell: 2, targetMapId: 5, targetCell: 0 });
    expect(() => map.addLink({ cell: 2, targetMapId: 7, targetCell: 0 })).toThrow(MapError);
    expect(() => map.addLink({ cell: 9, targetMapId: 7, targetCell: 0 })).toThrow(MapError);
  });

  it("serializes terrain and links without geometry and restores identically", () => {
    const map = new GameMap(squareState(3, 2), { terrain });
    map.setTerrain(4, "road");
    map.addLink({ cell: 1, targetMapId: 3, targetCell: 0 });
    const saved = JSON.parse(JSON.stringify(map.serialize())) as MapState;
    expect(Object.keys(saved).sort()).toEqual(
      ["cells", "gridType", "height", "id", "links", "params", "parentId", "width"].sort(),
    );
    const restored = new GameMap(saved, { terrain });
    expect(restored.serialize()).toEqual(map.serialize());
    expect(restored.terrainAt(4)).toBe("road");
  });

  it("rejects corrupt state", () => {
    const base = squareState(2, 2);
    const attempts: MapState[] = [
      { ...base, cells: base.cells.slice(1) },
      { ...base, cells: base.cells.map(() => ({ terrain: "lava" })) },
      { ...base, links: [{ cell: 9, targetMapId: 2, targetCell: 0 }] },
      {
        ...base,
        links: [
          { cell: 2, targetMapId: 2, targetCell: 0 },
          { cell: 1, targetMapId: 2, targetCell: 0 },
        ],
      },
      { ...base, width: undefined },
      { ...base, params: { generator: "blank", seed: 0, cellCount: 4 } },
      { ...base, id: 0 },
    ];
    for (const attempt of attempts) {
      expect(() => new GameMap(attempt, { terrain })).toThrow(MapError);
    }
    try {
      new GameMap({ ...base, cells: base.cells.slice(1) }, { terrain });
    } catch (failure) {
      expect((failure as MapError).kind).toBe(MapErrorKind.InvalidState);
    }
  });
});

describe("GameMap on a voronoi grid", () => {
  const terrain = createTerrain();

  it("regenerates identical geometry from params and does not serialize it", () => {
    const first = new GameMap(voronoiState(300, 42), { terrain });
    first.setTerrain(10, "river");
    const saved = JSON.parse(JSON.stringify(first.serialize())) as MapState;
    expect(JSON.stringify(saved)).not.toContain("adjacency");
    expect(saved.params).toEqual({ generator: "blank", seed: 42, cellCount: 300, relaxPasses: 2 });
    const second = new GameMap(saved, { terrain });
    expect(hashGeometry(second.geometry)).toBe(hashGeometry(first.geometry));
    expect(second.geometry.adjacency).toEqual(first.geometry.adjacency);
    expect(second.terrainAt(10)).toBe("river");
    expect(second.width).toBeNull();
    expect(() => second.squareCell(0, 0)).toThrow(MapError);
    expect(() => second.squareCoordinates(0)).toThrow(MapError);
  });

  it("returns ascending neighbours on both grid kinds (shared contract)", () => {
    const maps = [
      new GameMap(squareState(12, 12), { terrain }),
      new GameMap(voronoiState(144, 5), { terrain }),
    ];
    for (const map of maps) {
      for (let cell = 0; cell < map.cellCount; cell += 1) {
        const around = [...map.neighbors(cell)];
        expect(around).toEqual([...around].sort((left, right) => left - right));
        expect(new Set(around).size).toBe(around.length);
        expect(around).not.toContain(cell);
        for (const other of around) {
          expect(map.neighbors(other)).toContain(cell);
        }
      }
    }
  });

  it("rejects mismatched grid fields on load", () => {
    const state = voronoiState(20, 1);
    expect(() => new GameMap({ ...state, width: 4, height: 5 }, { terrain })).toThrow(MapError);
    expect(
      () => new GameMap({ ...state, params: { generator: "blank", seed: 1 } }, { terrain }),
    ).toThrow(MapError);
    expect(() => new GameMap({ ...state, cells: state.cells.slice(2) }, { terrain })).toThrow(
      MapError,
    );
  });
});
