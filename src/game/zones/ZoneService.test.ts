import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { GameEngine } from "../engine/GameEngine";
import { isBoardPaused, requireBoard } from "../jobs/jobBoards";
import { pauseBoard } from "../jobs/boardPause";
import { PauseSource } from "../jobs/jobTypes";
import { GridType } from "../map/mapTypes";
import { MapSize } from "../map/mapSize";
import { getStorageService } from "../storage/storageServiceRegistry";
import { isBorderCell } from "./zoneEvaluation";
import { ZoneError, ZoneErrorKind } from "./ZoneError";
import { createZoneWorld } from "./testZoneWorld";
import type { ZoneTestWorld } from "./testZoneWorld";
import { isInActiveZoneOfType } from "./zoneQueries";
import { getZoneService } from "./zoneServiceRegistry";
import { ZoneGapKind, ZoneStatus } from "./zoneTypes";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";

function kindOf(action: () => void): ZoneErrorKind | null {
  try {
    action();
  } catch (failure) {
    return failure instanceof ZoneError ? failure.kind : null;
  }
  return null;
}

function names(world: ZoneTestWorld): string[] {
  return world.events.map((event) => event.name);
}

// @covers 015:FR-003 015:FR-004 015:FR-006 015:FR-008 015:FR-012 015:FR-014 015:FR-015
// @covers 015:SC-001 015:SC-002 015:SC-003 015:SC-007
// @covers 017:SC-007
describe("ZoneService.designate", () => {
  it("paints a 5x5 area into one zone with ascending tiles", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const ids = world.designate("stockpile", world.rect(2, 2, 5, 5));
    expect(ids).toHaveLength(1);
    const data = world.zoneData(ids[0] ?? 0);
    expect(data.tiles).toHaveLength(25);
    expect(data.tiles).toEqual([...data.tiles].sort((left, right) => left - right));
    expect(data.zoneTypeId).toBe("stockpile");
    expect(data.mapId).toBe(world.mapId);
  });

  it("creates one zone per connected component, ids ascending by lowest cell", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const ids = world.designate("stockpile", [55, 56, 11, 12, 13, 98]);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBeLessThan(ids[1] ?? 0);
    expect(world.zoneData(ids[0] ?? 0).tiles).toEqual([11, 12, 13]);
    expect(world.zoneData(ids[1] ?? 0).tiles).toEqual([55, 56]);
    expect(world.zoneData(ids[2] ?? 0).tiles).toEqual([98]);
  });

  it("rejects a tile that is already zoned, or moves it with reassign", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const [first] = world.designate("stockpile", world.rect(2, 2, 3, 1));
    const service = getZoneService(world.engine);
    expect(kindOf(() => service.designate("stockpile", world.mapId, [24, 25], false))).toBe(
      ZoneErrorKind.TileAlreadyZoned,
    );
    expect(service.zoneIdAt(world.mapId, 25)).toBeNull();
    const [second] = world.designate("stockpile", [24, 25], true);
    expect(world.zoneData(first ?? 0).tiles).toEqual([22, 23]);
    expect(world.zoneData(second ?? 0).tiles).toEqual([24, 25]);
    expect(service.zoneIdAt(world.mapId, 24)).toBe(second);
  });

  it("rejects unknown types, unknown maps, bad cells and locked types", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const service = getZoneService(world.engine);
    expect(kindOf(() => service.designate("nope", world.mapId, [1], false))).toBe(
      ZoneErrorKind.UnknownZoneType,
    );
    expect(kindOf(() => service.designate("stockpile", 99, [1], false))).toBe(
      ZoneErrorKind.UnknownMap,
    );
    expect(kindOf(() => service.designate("stockpile", world.mapId, [100], false))).toBe(
      ZoneErrorKind.OutOfBounds,
    );
    world.setTier("hamlet");
    expect(kindOf(() => service.designate("bakery", world.mapId, [33], false))).toBe(
      ZoneErrorKind.ContentLocked,
    );
    world.setTier("village");
    expect(kindOf(() => service.designate("bakery", world.mapId, [33], false))).toBeNull();
  });
});

describe("ZoneService tiles", () => {
  it("adds adjacent tiles and makes disconnected new cells zones of their own", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const [zoneId] = world.designate("stockpile", world.rect(2, 2, 2, 1));
    const service = getZoneService(world.engine);
    const grown = service.addTiles(zoneId ?? 0, [24, 23, 77], false);
    expect(world.zoneData(zoneId ?? 0).tiles).toEqual([22, 23, 24]);
    expect(grown.newZoneIds).toHaveLength(1);
    expect(world.zoneData(grown.newZoneIds[0] ?? 0).tiles).toEqual([77]);
    expect(kindOf(() => service.addTiles(zoneId ?? 0, [77], false))).toBe(
      ZoneErrorKind.TileAlreadyZoned,
    );
  });

  it("shrinks, splits with the largest part keeping the id, and deletes an emptied zone", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const [zoneId] = world.designate("stockpile", world.rect(1, 1, 6, 1));
    const service = getZoneService(world.engine);
    const change = service.removeTiles(zoneId ?? 0, [12]);
    expect(change.newZoneIds).toHaveLength(1);
    expect(world.zoneData(zoneId ?? 0).tiles).toEqual([13, 14, 15, 16]);
    expect(world.zoneData(change.newZoneIds[0] ?? 0).tiles).toEqual([11]);
    world.run(1);
    expect(names(world)).toContain("zone.split");
    expect(world.events.find((event) => event.name === "zone.split")?.payload).toEqual({
      zoneId,
      newZoneIds: change.newZoneIds,
    });
    service.removeTiles(zoneId ?? 0, [13, 14, 15, 16]);
    world.run(1);
    expect(world.engine.store.get(zoneId ?? 0)).toBeUndefined();
    expect(service.zoneIdAt(world.mapId, 13)).toBeNull();
  });

  it("lets the part with the lowest cell keep the id on a tie", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const [zoneId] = world.designate("stockpile", world.rect(1, 1, 5, 1));
    const service = getZoneService(world.engine);
    const change = service.removeTiles(zoneId ?? 0, [13]);
    expect(world.zoneData(zoneId ?? 0).tiles).toEqual([11, 12]);
    expect(world.zoneData(change.newZoneIds[0] ?? 0).tiles).toEqual([14, 15]);
  });

  it("deletes a zone: tiles are free at once and the entity goes at slot 17", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const [zoneId] = world.designate("stockpile", world.rect(2, 2, 2, 2));
    const service = getZoneService(world.engine);
    service.deleteZone(zoneId ?? 0);
    expect(service.zoneIdAt(world.mapId, 22)).toBeNull();
    expect(service.getZone(zoneId ?? 0)).toBeNull();
    expect(kindOf(() => service.requireZone(zoneId ?? 0))).toBe(ZoneErrorKind.UnknownZone);
    world.run(1);
    expect(names(world)).toContain("zone.deleted");
    expect(world.engine.store.get(zoneId ?? 0)).toBeUndefined();
    expect(world.designate("stockpile", [22])).toHaveLength(1);
  });
});

describe("ZoneService timing and status", () => {
  it("derives status and queues zone.requirements.* in slot 9 of the changing tick", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    world.walls(3, 3, 2, 2, [23]);
    world.door(23);
    const [zoneId] = world.designate("bakery", world.rect(3, 3, 2, 2));
    world.run(1);
    expect(world.zoneData(zoneId ?? 0).status).toBe(ZoneStatus.Incomplete);
    expect(world.zoneData(zoneId ?? 0).isRoom).toBe(true);
    expect(names(world)).toEqual(["zone.created", "zone.room.changed"]);
    world.events.length = 0;
    const oven = world.furniture(34, "oven");
    world.run(1);
    expect(world.zoneData(zoneId ?? 0).status).toBe(ZoneStatus.Active);
    expect(world.events).toEqual([
      { name: "zone.requirements.met", payload: { zoneId, zoneTypeId: "bakery" } },
    ]);
    world.events.length = 0;
    world.run(3);
    expect(world.events).toEqual([]);
    world.engine.store.requestDelete(oven.id);
    world.run(1);
    expect(world.zoneData(zoneId ?? 0).active).toBe(false);
    expect(world.events).toEqual([
      {
        name: "zone.requirements.lost",
        payload: {
          zoneId,
          zoneTypeId: "bakery",
          gaps: [
            {
              kind: ZoneGapKind.MissingFurniture,
              requirement: "1x tag:oven",
              required: 1,
              present: 0,
            },
          ],
        },
      },
    ]);
  });

  it("applies effects from the tick after the status change", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    world.walls(3, 3, 2, 2);
    const [zoneId] = world.designate("pantry", world.rect(3, 3, 2, 2));
    const chest = world.chest(33);
    const storage = getStorageService(world.engine);
    world.run(1);
    expect(world.zoneData(zoneId ?? 0).active).toBe(true);
    expect(isInActiveZoneOfType(world.engine, world.mapId, 33, "pantry")).toBe(false);
    expect(storage.decayModifierMilli(chest)).toBe(1000);
    world.run(1);
    expect(isInActiveZoneOfType(world.engine, world.mapId, 33, "pantry")).toBe(true);
    expect(storage.decayModifierMilli(chest)).toBe(500);
    expect(storage.decayModifierMilli(world.spawn("peasant", 34))).toBe(1000);
  });

  it("re-detects a room when a wall is added or removed and keeps doors as walls", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const walls = world.walls(3, 3, 2, 2, [23]);
    const [zoneId] = world.designate("bedroom", world.rect(3, 3, 2, 2));
    world.run(1);
    expect(world.zoneData(zoneId ?? 0).isRoom).toBe(false);
    const door = world.door(23);
    world.run(1);
    expect(world.zoneData(zoneId ?? 0).isRoom).toBe(true);
    world.engine.store.requestDelete(walls.get(32)?.id ?? 0);
    world.run(1);
    expect(world.zoneData(zoneId ?? 0).isRoom).toBe(false);
    expect(door.prototype).toBe("door");
    expect(world.events.filter((event) => event.name === "zone.room.changed")).toHaveLength(2);
  });

  it("goes inactive when tiles are removed below the minimum size", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const [zoneId] = world.designate("farm_field", world.rect(2, 2, 2, 2));
    world.run(1);
    expect(world.zoneData(zoneId ?? 0).active).toBe(true);
    getZoneService(world.engine).removeTiles(zoneId ?? 0, [22]);
    world.run(1);
    const data = world.zoneData(zoneId ?? 0);
    expect(data.status).toBe(ZoneStatus.Inactive);
    expect(data.gaps).toEqual([
      { kind: ZoneGapKind.TooSmall, requirement: null, required: 4, present: 3 },
    ]);
    expect(names(world)).toContain("zone.requirements.lost");
  });

  it("evaluates adjacent zones of one type independently", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const [left] = world.designate("farm_field", world.rect(1, 1, 2, 2));
    const [right] = world.designate("farm_field", world.rect(3, 1, 2, 1));
    world.run(1);
    expect(world.zoneData(left ?? 0).active).toBe(true);
    expect(world.zoneData(right ?? 0).active).toBe(false);
  });
});

describe("ZoneService merge offers", () => {
  function setup(world: ZoneTestWorld, typeB = "stockpile") {
    world.walls(3, 3, 4, 2);
    const dividers = [world.wall(35), world.wall(45)];
    const [first] = world.designate("stockpile", [33, 34, 43, 44]);
    const [second] = world.designate(typeB, [36, 46]);
    world.run(1);
    return { dividers, zoneA: first ?? 0, zoneB: second ?? 0 };
  }

  it("offers a merge when a wall between same-type zones disappears and merges on accept", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const { dividers, zoneA, zoneB } = setup(world);
    expect(names(world)).not.toContain("zone.merge.offered");
    for (const wall of dividers) {
      world.engine.store.requestDelete(wall.id);
    }
    world.run(1);
    const service = getZoneService(world.engine);
    const offers = service.mergeOffers();
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ zoneAId: zoneA, zoneBId: zoneB });
    expect(world.events.filter((event) => event.name === "zone.merge.offered")).toHaveLength(1);
    world.run(3);
    expect(service.mergeOffers()).toHaveLength(1);
    expect(service.confirmMerge(offers[0]?.offerId ?? 0, true)).toBe(zoneA);
    expect(world.zoneData(zoneA).tiles).toEqual([33, 34, 35, 36, 43, 44, 45, 46]);
    world.run(1);
    expect(world.engine.store.get(zoneB)).toBeUndefined();
    expect(service.mergeOffers()).toEqual([]);
    expect(world.events.find((event) => event.name === "zone.merged")?.payload).toEqual({
      survivorId: zoneA,
      absorbedId: zoneB,
    });
  });

  it("declining keeps both zones and drops the offer; unknown offers are rejected", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const { dividers, zoneA, zoneB } = setup(world);
    for (const wall of dividers) {
      world.engine.store.requestDelete(wall.id);
    }
    world.run(1);
    const service = getZoneService(world.engine);
    const [offer] = service.mergeOffers();
    expect(service.confirmMerge(offer?.offerId ?? 0, false)).toBeNull();
    expect(service.mergeOffers()).toEqual([]);
    expect(world.zoneData(zoneA).tiles).toHaveLength(4);
    expect(world.zoneData(zoneB).tiles).toHaveLength(2);
    expect(kindOf(() => service.confirmMerge(offer?.offerId ?? 0, true))).toBe(
      ZoneErrorKind.UnknownOffer,
    );
  });

  it("makes no offer between zones of different types", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const { dividers } = setup(world, "farm_field");
    for (const wall of dividers) {
      world.engine.store.requestDelete(wall.id);
    }
    world.run(1);
    expect(getZoneService(world.engine).mergeOffers()).toEqual([]);
  });

  it("lapses an offer when one of the zones changes", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const { dividers, zoneB } = setup(world);
    for (const wall of dividers) {
      world.engine.store.requestDelete(wall.id);
    }
    world.run(1);
    const service = getZoneService(world.engine);
    expect(service.mergeOffers()).toHaveLength(1);
    service.addTiles(zoneB, [56], false);
    world.run(1);
    expect(service.mergeOffers()).toEqual([]);
  });

  it("keeps the offers in the save", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const { dividers } = setup(world);
    for (const wall of dividers) {
      world.engine.store.requestDelete(wall.id);
    }
    world.run(1);
    const hash = world.engine.getStateHash();
    world.engine.loadGame(world.engine.saveGame());
    expect(world.engine.getStateHash()).toBe(hash);
    expect(getZoneService(world.engine).mergeOffers()).toHaveLength(1);
  });
});

describe("ZoneService job boards", () => {
  it("pauses a board in an inactive zone with the system source and resumes it", () => {
    const world = createZoneWorld({ boardCell: 11 });
    const [zoneId] = world.designate("farm_field", [11, 12, 21]);
    world.run(1);
    const { data } = requireBoard(world.engine, world.boardId);
    expect(data.pausedBySystem).toBe(true);
    expect(data.pausedByPlayer).toBe(false);
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    getZoneService(world.engine).addTiles(zoneId ?? 0, [22], false);
    world.run(1);
    expect(data.pausedBySystem).toBe(false);
    expect(data.pausedByPlayer).toBe(true);
    expect(isBoardPaused(data)).toBe(true);
  });

  it("resumes the board when the zone is deleted and leaves other system pauses alone", () => {
    const world = createZoneWorld({ boardCell: 11 });
    const [zoneId] = world.designate("farm_field", [11, 12]);
    world.run(1);
    const { data } = requireBoard(world.engine, world.boardId);
    expect(data.pausedBySystem).toBe(true);
    getZoneService(world.engine).deleteZone(zoneId ?? 0);
    world.run(1);
    expect(data.pausedBySystem).toBe(false);
    pauseBoard(world.engine, world.boardId, PauseSource.System);
    world.run(2);
    expect(data.pausedBySystem).toBe(true);
  });
});

describe("ZoneService save and load", () => {
  it("restores zones, offers and boards identically, without events on load", () => {
    const world = createZoneWorld({ boardCell: 11 });
    world.walls(3, 3, 2, 2, [34]);
    world.door(34);
    world.designate("farm_field", [11, 12]);
    const [bedroom] = world.designate("bedroom", world.rect(3, 3, 2, 2));
    world.furniture(33, "wooden_bed");
    world.run(5);
    expect(world.zoneData(bedroom ?? 0).active).toBe(true);
    const text = world.engine.saveGame();
    const hash = world.engine.getStateHash();
    world.events.length = 0;
    world.run(4);
    world.engine.loadGame(text);
    expect(world.engine.getStateHash()).toBe(hash);
    expect(world.events).toEqual([]);
    expect(world.zoneData(bedroom ?? 0).active).toBe(true);
    expect(getZoneService(world.engine).zoneIdAt(world.mapId, 33)).toBe(bedroom);
    world.run(3);
    expect(world.events).toEqual([]);
    world.engine.store.requestDelete(
      world.engine.maps.occupants
        .occupantsOf(world.mapId, 33)
        .find((id) => world.engine.store.get(id)?.prototype === "furniture_piece") ?? 0,
    );
    world.run(1);
    expect(names(world)).toEqual(["zone.requirements.lost"]);
  });

  it("re-derives the status from the world after a load, not from the save (FR-013)", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    world.walls(3, 3, 2, 2);
    const [zoneId] = world.designate("bedroom", world.rect(3, 3, 2, 2));
    world.furniture(33, "wooden_bed");
    world.run(2);
    expect(world.zoneData(zoneId ?? 0).active).toBe(true);
    const saved = JSON.parse(world.engine.saveGame()) as {
      entities: { id: number; components: Record<string, { active: boolean; status: string }> }[];
    };
    const zone = saved.entities.find((entity) => entity.id === zoneId)?.components["Zone"];
    if (zone !== undefined) {
      zone.active = false;
      zone.status = "inactive";
    }
    world.engine.loadGame(JSON.stringify(saved));
    expect(world.zoneData(zoneId ?? 0).active).toBe(true);
    expect(world.zoneData(zoneId ?? 0).status).toBe(ZoneStatus.Active);
  });
});

describe("ZoneService on a Voronoi map", () => {
  it("designates, encloses with walls on the ring and splits by adjacency", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const engine: GameEngine = world.engine;
    const map = engine.maps.createMap({
      gridType: GridType.Voronoi,
      terrainId: "grassland",
      size: MapSize.Small,
      seed: 5,
    });
    let tiles: number[] = [];
    for (let cell = 0; cell < map.cellCount && tiles.length === 0; cell += 1) {
      const candidate = [cell, ...map.neighbors(cell).slice(0, 2)].sort(
        (left, right) => left - right,
      );
      if (candidate.every((tile) => !isBorderCell(map, tile))) {
        tiles = candidate;
      }
    }
    const result = world.command("DesignateZone", {
      zoneTypeId: "stockpile",
      mapId: map.id,
      cells: tiles,
    }) as { zoneIds: number[] };
    expect(result.zoneIds).toHaveLength(1);
    const service = getZoneService(engine);
    const zoneId = result.zoneIds[0] ?? 0;
    for (const tile of tiles) {
      expect(service.zoneIdAt(map.id, tile)).toBe(zoneId);
    }
    const ring = new Set<number>();
    for (const tile of tiles) {
      for (const next of map.neighbors(tile)) {
        if (!tiles.includes(next)) {
          ring.add(next);
        }
      }
    }
    for (const cell of ring) {
      const wall = engine.store.spawn("wall", { Position: { mapId: map.id, cellIndex: cell } });
      engine.maps.placeEntity(wall.id, map.id, cell);
    }
    world.run(1);
    expect(world.zoneData(zoneId).isRoom).toBe(true);
    expect(world.zoneData(zoneId).active).toBe(true);
    const far = service.designate("stockpile", map.id, [map.cellCount - 1], false);
    expect(far).toHaveLength(1);
    const split = service.removeTiles(zoneId, [tiles[0] ?? 0]);
    expect(split.zoneId).toBe(zoneId);
  });

  it("never treats a zone on the map border as a room", () => {
    const world = createZoneWorld({ content: loadVillageBakeryContent() });
    const map = world.engine.maps.createMap({
      gridType: GridType.Voronoi,
      terrainId: "grassland",
      size: MapSize.Small,
      seed: 5,
    });
    const border = map.geometry.polygons.findIndex((polygon) =>
      polygon.some((corner) => corner.x <= 0),
    );
    const [zoneId] = (
      world.command("DesignateZone", { zoneTypeId: "bedroom", mapId: map.id, cells: [border] }) as {
        zoneIds: number[];
      }
    ).zoneIds;
    for (const next of map.neighbors(border)) {
      const wall = world.engine.store.spawn("wall", {
        Position: { mapId: map.id, cellIndex: next },
      });
      world.engine.maps.placeEntity(wall.id, map.id, next);
    }
    world.run(1);
    expect(world.zoneData(zoneId ?? 0).isRoom).toBe(false);
  });
});

describe("loadContent zones", () => {
  it("has the zone types the tests rely on", () => {
    const content = loadContent();
    for (const id of ["stockpile", "pantry", "farm_field", "bakery", "bedroom", "throne_room"]) {
      expect(content.zones.has(id)).toBe(true);
    }
  });
});
