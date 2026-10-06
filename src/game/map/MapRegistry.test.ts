import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ComponentRegistry, defineComponent } from "../ecs/ComponentRegistry";
import { EntityStore } from "../ecs/EntityStore";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import { EventBus } from "../engine/EventBus";
import type { GameEvent, JsonValue } from "../engine/EventBus";
import { CounterName, IdCounters } from "../engine/IdCounters";
import { MapError, MapErrorKind } from "./MapError";
import { MapRegistry } from "./MapRegistry";
import { MapSize } from "./mapSize";
import { BlockReason, GridType, MoveCostClass } from "./mapTypes";
import { positionComponent } from "./positionComponent";
import { TerrainRegistry } from "./TerrainRegistry";
import { hashGeometry } from "./voronoiGeometry";

type Fixture = {
  registry: MapRegistry;
  counters: IdCounters;
  bus: EventBus;
  events: GameEvent[];
  terrain: TerrainRegistry;
};

function createFixture(): Fixture {
  const terrain = new TerrainRegistry();
  terrain.registerAll([
    { id: "grass", moveCost: MoveCostClass.Normal, passable: true, blockReason: null },
    { id: "floor", moveCost: MoveCostClass.Fastest, passable: true, blockReason: null },
    { id: "river", moveCost: MoveCostClass.Slow, passable: false, blockReason: BlockReason.Water },
  ]);
  const counters = new IdCounters();
  const bus = new EventBus();
  const events: GameEvent[] = [];
  bus.subscribe("**", (_payload, event) => events.push(event));
  const registry = new MapRegistry({ terrain, counters, bus });
  return { registry, counters, bus, events, terrain };
}

function topics(fixture: Fixture): string[] {
  fixture.bus.processQueue();
  return fixture.events.map((event) => event.name);
}

describe("MapRegistry.createMap", () => {
  it("allocates ids from the persisted counter and emits map.created", () => {
    const fixture = createFixture();
    const main = fixture.registry.createMap({
      gridType: GridType.Voronoi,
      terrainId: "grass",
      cellCount: 50,
      seed: 42,
    });
    const hut = fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "floor",
      width: 5,
      height: 4,
      parentId: main.id,
    });
    expect([main.id, hut.id]).toEqual([1, 2]);
    expect(fixture.counters.peek(CounterName.MapId)).toBe(3);
    expect(hut.parentId).toBe(1);
    expect(fixture.registry.get(2)).toBe(hut);
    expect(fixture.registry.size).toBe(2);
    expect(topics(fixture)).toEqual(["map.created", "map.created"]);
    expect(fixture.events[0]?.payload).toEqual({ mapId: 1, gridType: "voronoi" });
    expect(fixture.events[1]?.payload).toEqual({ mapId: 2, gridType: "square" });
  });

  // @covers 004:FR-006
  it("maps MapSize to dimensions per DECISIONS D-06", () => {
    const fixture = createFixture();
    const small = fixture.registry.createMap({
      gridType: GridType.Voronoi,
      terrainId: "grass",
      size: MapSize.Small,
      seed: 1,
    });
    expect(small.cellCount).toBe(600);
    const square = fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "grass",
      size: MapSize.Medium,
    });
    expect([square.width, square.height, square.cellCount]).toEqual([40, 30, 1200]);
  });

  // @covers 004:FR-006
  it("rejects invalid options without burning an id", () => {
    const fixture = createFixture();
    const make = (options: Parameters<MapRegistry["createMap"]>[0]): void => {
      fixture.registry.createMap(options);
    };
    expect(() => make({ gridType: GridType.Voronoi, terrainId: "grass", cellCount: 9 })).toThrow(
      /seed/,
    );
    expect(() => make({ gridType: GridType.Voronoi, terrainId: "grass", seed: 1 })).toThrow(
      MapError,
    );
    expect(() => make({ gridType: GridType.Square, terrainId: "grass", width: 3 })).toThrow(
      MapError,
    );
    expect(() =>
      make({ gridType: GridType.Square, terrainId: "grass", size: MapSize.Small, width: 3 }),
    ).toThrow(MapError);
    expect(() =>
      make({ gridType: GridType.Square, terrainId: "lava", width: 3, height: 3 }),
    ).toThrow(MapError);
    expect(() =>
      make({ gridType: GridType.Square, terrainId: "grass", width: 3, height: 3, parentId: 77 }),
    ).toThrow(MapError);
    expect(fixture.counters.peek(CounterName.MapId)).toBe(1);
    expect(fixture.registry.size).toBe(0);
  });

  it("looks up, lists and requires maps", () => {
    const fixture = createFixture();
    fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "grass",
      width: 2,
      height: 2,
    });
    fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "grass",
      width: 2,
      height: 2,
    });
    expect(fixture.registry.list().map((map) => map.id)).toEqual([1, 2]);
    expect(fixture.registry.get(3)).toBeUndefined();
    expect(() => fixture.registry.require(3)).toThrow(MapError);
  });
});

describe("MapRegistry sub-maps and links", () => {
  function world(): { fixture: Fixture; main: number; hut: number; cellar: number } {
    const fixture = createFixture();
    const main = fixture.registry.createMap({
      gridType: GridType.Voronoi,
      terrainId: "grass",
      cellCount: 80,
      seed: 3,
    });
    const hut = fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "floor",
      width: 4,
      height: 4,
      parentId: main.id,
    });
    const cellar = fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "floor",
      width: 3,
      height: 3,
      parentId: hut.id,
    });
    return { fixture, main: main.id, hut: hut.id, cellar: cellar.id };
  }

  it("tracks parent and child maps", () => {
    const { fixture, main, hut, cellar } = world();
    expect(fixture.registry.childrenOf(main).map((map) => map.id)).toEqual([hut]);
    expect(fixture.registry.childrenOf(hut).map((map) => map.id)).toEqual([cellar]);
    expect(fixture.registry.childrenOf(cellar)).toEqual([]);
    expect(() => fixture.registry.childrenOf(99)).toThrow(MapError);
  });

  // @covers 004:FR-012
  // @covers 004:SC-008
  it("moves an entity through links between a voronoi map and a square sub-map and back", () => {
    const { fixture, main, hut } = world();
    fixture.registry.linkMaps({
      mapId: main,
      cell: 17,
      targetMapId: hut,
      targetCell: 0,
      bidirectional: true,
    });
    fixture.registry.placeEntity(7, main, 17);
    fixture.bus.processQueue();
    fixture.events.length = 0;
    const inside = fixture.registry.travel(7);
    expect(inside).toEqual({ mapId: hut, cellIndex: 0 });
    expect(fixture.registry.occupants.occupantsOf(main, 17)).toEqual([]);
    expect(fixture.registry.occupants.occupantsOf(hut, 0)).toEqual([7]);
    expect(topics(fixture)).toEqual(["entity.map.changed"]);
    expect(fixture.events[0]?.payload).toEqual({
      entityId: 7,
      fromMapId: main,
      toMapId: hut,
      cellIndex: 0,
    });
    expect(fixture.registry.travel(7)).toEqual({ mapId: main, cellIndex: 17 });
  });

  it("refuses travel without a link, to blocked targets, and unplaced entities", () => {
    const { fixture, main, hut } = world();
    fixture.registry.placeEntity(7, main, 3);
    expect(() => fixture.registry.travel(7)).toThrow(/no link/);
    expect(() => fixture.registry.travel(99)).toThrow(MapError);
    fixture.registry.linkMaps({ mapId: main, cell: 3, targetMapId: hut, targetCell: 5 });
    fixture.registry.require(hut).setObstruction(5, BlockReason.Wall);
    expect(() => fixture.registry.travel(7)).toThrowError(/not traversable/);
    expect(fixture.registry.occupants.locationOf(7)).toEqual({ mapId: main, cellIndex: 3 });
  });

  it("validates links", () => {
    const { fixture, main, hut } = world();
    const link = (options: Parameters<MapRegistry["linkMaps"]>[0]): void => {
      fixture.registry.linkMaps(options);
    };
    expect(() => link({ mapId: main, cell: 1, targetMapId: main, targetCell: 2 })).toThrow(
      MapError,
    );
    expect(() => link({ mapId: main, cell: 1, targetMapId: 99, targetCell: 2 })).toThrow(MapError);
    expect(() => link({ mapId: main, cell: 1, targetMapId: hut, targetCell: 99 })).toThrow(
      MapError,
    );
    expect(() => link({ mapId: main, cell: 999, targetMapId: hut, targetCell: 1 })).toThrow(
      MapError,
    );
    link({ mapId: main, cell: 1, targetMapId: hut, targetCell: 1, bidirectional: true });
    expect(() => link({ mapId: main, cell: 1, targetMapId: hut, targetCell: 2 })).toThrow(MapError);
    expect(() =>
      link({ mapId: main, cell: 2, targetMapId: hut, targetCell: 1, bidirectional: true }),
    ).toThrow(MapError);
    expect(fixture.registry.require(main).getLink(2)).toBeNull();
  });

  it("rejects deleting maps that are in use and allows deleting free ones", () => {
    const { fixture, main, hut, cellar } = world();
    expect(() => fixture.registry.deleteMap(main)).toThrowError(/sub-maps/);
    fixture.registry.linkMaps({ mapId: hut, cell: 0, targetMapId: cellar, targetCell: 0 });
    fixture.registry.placeEntity(1, cellar, 4);
    expect(() => fixture.registry.deleteMap(cellar)).toThrowError(
      /entities stand on it.*link into/,
    );
    fixture.registry.removeEntity(1);
    expect(() => fixture.registry.deleteMap(cellar)).toThrowError(/link into/);
    fixture.registry.require(hut).getLink(0);
    expect(() => fixture.registry.deleteMap(99)).toThrow(MapError);
  });

  it("deletes a leaf map once nothing refers to it and never reuses its id", () => {
    const { fixture, hut, cellar } = world();
    fixture.registry.deleteMap(cellar);
    expect(fixture.registry.get(cellar)).toBeUndefined();
    expect(fixture.registry.childrenOf(hut)).toEqual([]);
    const next = fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "floor",
      width: 2,
      height: 2,
    });
    expect(next.id).toBe(cellar + 1);
  });

  // @covers 004:FR-010
  // @covers 004:SC-006
  it("supports a main map plus five sub-maps", () => {
    const fixture = createFixture();
    const main = fixture.registry.createMap({
      gridType: GridType.Voronoi,
      terrainId: "grass",
      cellCount: 60,
      seed: 9,
    });
    for (let index = 0; index < 5; index += 1) {
      const sub = fixture.registry.createMap({
        gridType: GridType.Square,
        terrainId: "floor",
        width: 4,
        height: 4,
        parentId: main.id,
      });
      fixture.registry.linkMaps({
        mapId: main.id,
        cell: index,
        targetMapId: sub.id,
        targetCell: 0,
        bidirectional: true,
      });
    }
    expect(fixture.registry.childrenOf(main.id)).toHaveLength(5);
    expect(fixture.registry.size).toBe(6);
  });
});

describe("MapRegistry entity placement", () => {
  function hamlet(): { fixture: Fixture; mapId: number } {
    const fixture = createFixture();
    const map = fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "grass",
      width: 8,
      height: 8,
    });
    return { fixture, mapId: map.id };
  }

  // @covers 004:FR-003
  // @covers 004:FR-015
  it("places entities, allows co-location and lists occupants in the cell query", () => {
    const { fixture, mapId } = hamlet();
    fixture.registry.placeEntity(5, mapId, 42);
    fixture.registry.placeEntity(2, mapId, 42);
    const info = fixture.registry.queryCell(mapId, 42);
    expect(info.occupants).toEqual([2, 5]);
    expect(info).toMatchObject({
      traversable: true,
      terrainType: "grass",
      moveCost: 10,
      blockReason: null,
      link: null,
    });
  });

  // @covers 004:FR-004
  // @covers 004:FR-005
  it("throws a clear error when placing into a wall, water or out of bounds", () => {
    const { fixture, mapId } = hamlet();
    const map = fixture.registry.require(mapId);
    map.setObstruction(10, BlockReason.Wall);
    map.setTerrain(11, "river");
    expect(() => fixture.registry.placeEntity(1, mapId, 10)).toThrowError(
      /not traversable \(wall\)/,
    );
    expect(() => fixture.registry.placeEntity(1, mapId, 11)).toThrowError(/\(water\)/);
    expect(() => fixture.registry.placeEntity(1, mapId, 64)).toThrow(MapError);
    expect(() => fixture.registry.placeEntity(1, 99, 0)).toThrow(MapError);
    expect(fixture.registry.occupants.size).toBe(0);
    const blocked = fixture.registry.queryCell(mapId, 10);
    expect(blocked.traversable).toBe(false);
    expect(blocked.blockReason).toBe(BlockReason.Wall);
    expect(blocked.terrainType).toBe("grass");
  });

  // @covers 004:FR-004
  it("moves entities within a map and blocks moves into obstructions", () => {
    const { fixture, mapId } = hamlet();
    fixture.registry.placeEntity(1, mapId, 0);
    expect(fixture.registry.moveEntity(1, 1)).toBe(0);
    fixture.registry.require(mapId).setObstruction(2, BlockReason.Wall);
    expect(() => fixture.registry.moveEntity(1, 2)).toThrow(MapError);
    expect(fixture.registry.occupants.locationOf(1)).toEqual({ mapId, cellIndex: 1 });
    expect(() => fixture.registry.moveEntity(9, 3)).toThrow(MapError);
  });

  it("removes entities and transfers them to any traversable cell", () => {
    const { fixture, mapId } = hamlet();
    const other = fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "floor",
      width: 2,
      height: 2,
    });
    fixture.registry.placeEntity(1, mapId, 0);
    expect(fixture.registry.transferEntity(1, other.id, 3)).toEqual({
      mapId: other.id,
      cellIndex: 3,
    });
    expect(fixture.registry.transferEntity(1, other.id, 1)).toEqual({
      mapId: other.id,
      cellIndex: 1,
    });
    expect(fixture.registry.removeEntity(1)).toEqual({ mapId: other.id, cellIndex: 1 });
    expect(fixture.registry.occupants.size).toBe(0);
    expect(() => fixture.registry.removeEntity(1)).toThrow(MapError);
  });

  // @covers 010:FR-013
  it("emits terrain and obstruction events through the shared bus", () => {
    const { fixture, mapId } = hamlet();
    const map = fixture.registry.require(mapId);
    map.setTerrain(5, "river");
    map.setObstruction(6, BlockReason.Furniture);
    expect(topics(fixture)).toEqual([
      "map.created",
      "map.terrain.changed",
      "map.cell.obstruction.changed",
    ]);
  });
});

describe("MapRegistry save and load", () => {
  function populated(): Fixture {
    const fixture = createFixture();
    const main = fixture.registry.createMap({
      gridType: GridType.Voronoi,
      terrainId: "grass",
      cellCount: 4096,
      seed: 42,
    });
    const hut = fixture.registry.createMap({
      gridType: GridType.Square,
      terrainId: "floor",
      width: 6,
      height: 5,
      parentId: main.id,
    });
    fixture.registry.linkMaps({
      mapId: main.id,
      cell: 100,
      targetMapId: hut.id,
      targetCell: 3,
      bidirectional: true,
    });
    main.setTerrain(7, "river");
    hut.setTerrain(9, "grass");
    return fixture;
  }

  // @covers 004:FR-017
  // @covers 004:FR-018
  // @covers 004:SC-010
  it("round-trips through JSON and regenerates identical geometry and adjacency", () => {
    const original = populated();
    const text = JSON.stringify(original.registry.serialize());
    expect(text).not.toContain("adjacency");
    expect(text.length).toBeLessThan(400_000);
    const copy = createFixture();
    copy.counters.restore(JSON.parse(JSON.stringify(original.counters.serialize())) as JsonValue);
    copy.registry.restore(JSON.parse(text) as JsonValue);
    expect(JSON.stringify(copy.registry.serialize())).toBe(text);
    for (const map of original.registry.list()) {
      const restored = copy.registry.require(map.id);
      expect(hashGeometry(restored.geometry)).toBe(hashGeometry(map.geometry));
      expect(restored.geometry.adjacency).toEqual(map.geometry.adjacency);
      expect(restored.links()).toEqual(map.links());
    }
    expect(copy.registry.require(1).terrainAt(7)).toBe("river");
    expect(copy.registry.childrenOf(1).map((map) => map.id)).toEqual([2]);
  });

  // @covers 006:FR-006
  // @covers 006:SC-007
  it("rebuilds occupants from Position components after loading the entity store", () => {
    const original = populated();
    const components = new ComponentRegistry();
    components.register(positionComponent);
    components.register(defineComponent("Tag", z.object({}).strict(), () => ({})));
    const prototypes = new PrototypeRegistry(components);
    prototypes.registerAll([
      { id: "settler", components: { Position: {} } },
      { id: "crate", components: { Tag: {} } },
    ]);
    const store = new EntityStore({ components, prototypes, counters: original.counters });
    const first = store.spawn("settler", { Position: { mapId: 2, cellIndex: 3 } });
    const second = store.spawn("settler", { Position: { mapId: 2, cellIndex: 3 } });
    store.spawn("crate");
    original.registry.placeEntity(first.id, 2, 3);
    original.registry.placeEntity(second.id, 2, 3);

    const mapsText = JSON.stringify(original.registry.serialize());
    const entitiesText = JSON.stringify(store.serialize());
    const loaded = createFixture();
    loaded.counters.restore(JSON.parse(JSON.stringify(original.counters.serialize())) as JsonValue);
    loaded.registry.restore(JSON.parse(mapsText) as JsonValue);
    const loadedStore = new EntityStore({ components, prototypes, counters: loaded.counters });
    loadedStore.restore(JSON.parse(entitiesText) as JsonValue);
    loaded.registry.rebuildOccupants(loadedStore.entities());
    expect(loaded.registry.occupants.occupantsOf(2, 3)).toEqual([first.id, second.id]);
    expect(loaded.registry.queryCell(2, 3).occupants).toEqual([first.id, second.id]);
    expect(loaded.registry.occupants.size).toBe(2);
  });

  it("rejects a Position on a missing map or cell and keeps the index empty", () => {
    const fixture = populated();
    const stray = {
      id: 1,
      prototype: "settler",
      components: { Position: { mapId: 2, cellIndex: 999 } },
    };
    expect(() => fixture.registry.rebuildOccupants([stray])).toThrow(MapError);
    expect(fixture.registry.occupants.size).toBe(0);
    const lost = { ...stray, components: { Position: { mapId: 9, cellIndex: 0 } } };
    expect(() => fixture.registry.rebuildOccupants([lost])).toThrow(MapError);
  });

  // @covers 004:FR-018
  it("rejects corrupt saves and keeps the current maps", () => {
    const original = populated();
    const good = JSON.parse(JSON.stringify(original.registry.serialize())) as {
      id: number;
      parentId: number | null;
      links: { cell: number; targetMapId: number; targetCell: number }[];
    }[];
    const target = createFixture();
    target.counters.restore(JSON.parse(JSON.stringify(original.counters.serialize())) as JsonValue);
    target.registry.createMap({
      gridType: GridType.Square,
      terrainId: "grass",
      width: 2,
      height: 2,
    });
    const variants: JsonValue[] = [
      "nope",
      [{ id: 1 }],
      JSON.parse(JSON.stringify([good[1], good[0]])) as JsonValue,
      JSON.parse(JSON.stringify([{ ...good[0], id: 99 }])) as JsonValue,
      JSON.parse(JSON.stringify([{ ...good[0], parentId: 2 }, good[1]])) as JsonValue,
      JSON.parse(
        JSON.stringify([
          { ...good[0], links: [{ cell: 1, targetMapId: 9, targetCell: 0 }] },
          good[1],
        ]),
      ) as JsonValue,
    ];
    for (const variant of variants) {
      expect(() => target.registry.restore(variant)).toThrow(MapError);
    }
    expect(target.registry.size).toBe(1);
    expect(target.registry.list()[0]?.cellCount).toBe(4);
    try {
      target.registry.restore("nope");
    } catch (failure) {
      expect((failure as MapError).kind).toBe(MapErrorKind.InvalidState);
    }
  });
});
