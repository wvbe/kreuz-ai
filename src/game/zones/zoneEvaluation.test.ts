import { describe, expect, it } from "vitest";
import { BlockReason } from "../map/mapTypes";
import {
  enclosingRingCells,
  evaluateZone,
  isBorderCell,
  isEnclosed,
  isEnclosingCell,
} from "./zoneEvaluation";
import { contentWithZones, createZoneWorld } from "./testZoneWorld";
import { ZoneGapKind, ZoneStatus } from "./zoneTypes";

const hall = {
  id: "test_hall",
  name: "Test hall",
  requiresRoom: true,
  minTiles: 4,
  requiresJobBoard: true,
  furnitureRequirements: [
    [
      { kind: "id", ref: "chest", count: 2 },
      { kind: "id", ref: "table", count: 1 },
    ],
    [{ kind: "tag", ref: "bed", count: 1, perTiles: 4 }],
  ],
};

describe("isBorderCell", () => {
  it("is true on the edge of a square map and false inside", () => {
    const world = createZoneWorld();
    const map = world.engine.maps.require(world.mapId);
    expect(isBorderCell(map, 0)).toBe(true);
    expect(isBorderCell(map, 9)).toBe(true);
    expect(isBorderCell(map, 95)).toBe(true);
    expect(isBorderCell(map, 55)).toBe(false);
  });
});

describe("isEnclosingCell", () => {
  it("counts walls, doors and wall obstructions, not furniture or an empty cell", () => {
    const world = createZoneWorld();
    const map = world.engine.maps.require(world.mapId);
    world.wall(11);
    world.door(12);
    world.furniture(13, "table");
    map.setObstruction(14, BlockReason.Wall);
    expect(isEnclosingCell(world.engine, map, 11)).toBe(true);
    expect(isEnclosingCell(world.engine, map, 12)).toBe(true);
    expect(isEnclosingCell(world.engine, map, 13)).toBe(false);
    expect(isEnclosingCell(world.engine, map, 14)).toBe(true);
    expect(isEnclosingCell(world.engine, map, 15)).toBe(false);
  });

  it("ignores a wall that is being deleted", () => {
    const world = createZoneWorld();
    const map = world.engine.maps.require(world.mapId);
    const wall = world.wall(11);
    world.engine.store.requestDelete(wall.id);
    expect(isEnclosingCell(world.engine, map, 11)).toBe(false);
  });
});

describe("enclosingRingCells and isEnclosed", () => {
  it("lists the walls around the tiles and needs all of the ring", () => {
    const world = createZoneWorld();
    const map = world.engine.maps.require(world.mapId);
    const tiles = world.rect(3, 3, 2, 2);
    world.walls(3, 3, 2, 2, [24]);
    expect(isEnclosed(world.engine, map, tiles)).toBe(false);
    expect(enclosingRingCells(world.engine, map, tiles)).toEqual([23, 32, 35, 42, 45, 53, 54]);
    world.wall(24);
    expect(isEnclosed(world.engine, map, tiles)).toBe(true);
  });

  it("never counts the map border as enclosed", () => {
    const world = createZoneWorld();
    const map = world.engine.maps.require(world.mapId);
    world.walls(0, 0, 2, 2);
    expect(isEnclosed(world.engine, map, world.rect(0, 0, 2, 2))).toBe(false);
    expect(isEnclosed(world.engine, map, [])).toBe(false);
  });

  it("does not let a neighbouring zone stand in for a wall", () => {
    const world = createZoneWorld();
    const map = world.engine.maps.require(world.mapId);
    world.designate("stockpile", world.rect(5, 3, 2, 2));
    world.walls(3, 3, 2, 2, world.rect(5, 3, 1, 2));
    expect(isEnclosed(world.engine, map, world.rect(3, 3, 2, 2))).toBe(false);
  });
});

describe("evaluateZone", () => {
  function room(typeId: string, columns = 3, rows = 3) {
    const world = createZoneWorld();
    const [zoneId] = world.designate(typeId, world.rect(3, 3, columns, rows));
    return { world, zoneId: zoneId ?? 0 };
  }

  it("is active for a stockpile and needs no room", () => {
    const { world, zoneId } = room("stockpile", 1, 1);
    const result = evaluateZone(world.engine, world.zoneData(zoneId));
    expect(result.status).toBe(ZoneStatus.Active);
    expect(result.gaps).toEqual([]);
    expect(result.isRoom).toBe(false);
  });

  it("reports TooSmall as inactive with the tile counts", () => {
    const { world, zoneId } = room("farm_field", 1, 2);
    const result = evaluateZone(world.engine, world.zoneData(zoneId));
    expect(result.status).toBe(ZoneStatus.Inactive);
    expect(result.gaps).toEqual([
      { kind: ZoneGapKind.TooSmall, requirement: null, required: 4, present: 2 },
    ]);
  });

  it("reports NotEnclosed, then MissingFurniture, then nothing for a bakery", () => {
    const { world, zoneId } = room("bakery");
    let result = evaluateZone(world.engine, world.zoneData(zoneId));
    expect(result.status).toBe(ZoneStatus.Inactive);
    expect(result.gaps.map((gap) => gap.kind)).toEqual([
      ZoneGapKind.NotEnclosed,
      ZoneGapKind.MissingFurniture,
    ]);
    world.walls(3, 3, 3, 3, [23]);
    world.door(23);
    result = evaluateZone(world.engine, world.zoneData(zoneId));
    expect(result.isRoom).toBe(true);
    expect(result.status).toBe(ZoneStatus.Incomplete);
    expect(result.gaps).toEqual([
      {
        kind: ZoneGapKind.MissingFurniture,
        requirement: "1x tag:oven",
        required: 1,
        present: 0,
      },
    ]);
    const oven = world.furniture(44, "oven");
    result = evaluateZone(world.engine, world.zoneData(zoneId));
    expect(result.status).toBe(ZoneStatus.Active);
    expect(result.furniture).toEqual([oven.id]);
  });

  it("matches furniture by id (throne room table) and ignores furniture outside the tiles", () => {
    const { world, zoneId } = room("throne_room", 2, 2);
    world.walls(3, 3, 2, 2, []);
    world.furniture(60, "table");
    const result = evaluateZone(world.engine, world.zoneData(zoneId));
    expect(result.gaps.map((gap) => gap.kind)).toContain(ZoneGapKind.TooSmall);
    expect(result.gaps.map((gap) => gap.kind)).toContain(ZoneGapKind.MissingFurniture);
  });

  it("reports a missing job board, an OR requirement and a density from the content", () => {
    const world = createZoneWorld({ content: contentWithZones([hall]) });
    const [zoneId] = world.designate("test_hall", world.rect(3, 3, 2, 4));
    world.walls(3, 3, 2, 4);
    let result = evaluateZone(world.engine, world.zoneData(zoneId ?? 0));
    expect(result.status).toBe(ZoneStatus.Incomplete);
    expect(result.gaps).toEqual([
      {
        kind: ZoneGapKind.MissingFurniture,
        requirement: "2x id:chest or 1x id:table",
        required: 1,
        present: 0,
      },
      {
        kind: ZoneGapKind.MissingFurniture,
        requirement: "1x tag:bed per 4 tiles",
        required: 2,
        present: 0,
      },
      { kind: ZoneGapKind.MissingJobBoard, requirement: null, required: 1, present: 0 },
    ]);
    world.furniture(33, "table");
    world.furniture(34, "wooden_bed");
    world.furniture(43, "wooden_bed");
    world.spawn("job_board", 44);
    result = evaluateZone(world.engine, world.zoneData(zoneId ?? 0));
    expect(result.status).toBe(ZoneStatus.Active);
    expect(result.boards).toHaveLength(1);
  });
});
