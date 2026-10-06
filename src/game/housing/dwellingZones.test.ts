import { describe, expect, it } from "vitest";
import {
  dwellingBeds,
  dwellingCapacity,
  dwellingFurniture,
  dwellingOf,
  dwellingStorage,
  listDwellings,
} from "./dwellingZones";
import { createHousingWorld } from "./testHousingWorld";

describe("dwellingZones", () => {
  it("lists dwellings ascending and finds them by id", () => {
    const world = createHousingWorld({ width: 14, height: 8 });
    const first = world.dwelling(1, 2);
    const second = world.dwelling(6, 2);
    expect(listDwellings(world.engine).map((record) => record.entity.id)).toEqual([first, second]);
    expect(dwellingOf(world.engine, second)?.dwelling.level).toBe("hovel");
    expect(dwellingOf(world.engine, 1)).toBeNull();
    expect(dwellingOf(world.engine, 9999)).toBeNull();
  });

  it("finds furniture, beds and storage on the dwelling's tiles only", () => {
    const world = createHousingWorld();
    const zone = world.dwelling(2, 2, { beds: 2 });
    const tiles = world.tiles(zone);
    const chest = world.chest(tiles[3] as number);
    world.chest(0);
    const record = dwellingOf(world.engine, zone);
    expect(record).not.toBeNull();
    if (record === null) {
      return;
    }
    expect(dwellingFurniture(world.engine, record.zone).map((piece) => piece.furnitureId)).toEqual([
      "wooden_bed",
      "wooden_bed",
      "chest",
    ]);
    expect(dwellingBeds(world.engine, record.zone)).toHaveLength(2);
    expect(dwellingStorage(world.engine, record.zone).map((entity) => entity.id)).toEqual([
      chest.id,
    ]);
  });

  it("caps the capacity by the beds (FR-012)", () => {
    const world = createHousingWorld();
    const oneBed = world.dwelling(1, 1, { beds: 1 });
    const threeBeds = world.dwelling(5, 5, { columns: 3, rows: 2, beds: 3 });
    const capacityOf = (id: number): number => {
      const record = dwellingOf(world.engine, id);
      return record === null ? -1 : dwellingCapacity(world.engine, record);
    };
    expect(capacityOf(oneBed)).toBe(1);
    expect(capacityOf(threeBeds)).toBe(2);
  });
});
