import { describe, expect, it } from "vitest";
import type { Entity } from "../ecs/Entity";
import { MapError, MapErrorKind } from "./MapError";
import { OccupantIndex } from "./OccupantIndex";

function entityAt(id: number, mapId: number, cellIndex: number): Entity {
  return { id, prototype: "settler", components: { Position: { mapId, cellIndex } } };
}

describe("OccupantIndex", () => {
  it("lists co-located occupants ascending and tracks locations", () => {
    const index = new OccupantIndex();
    index.add(9, { mapId: 1, cellIndex: 42 });
    index.add(3, { mapId: 1, cellIndex: 42 });
    index.add(5, { mapId: 2, cellIndex: 42 });
    expect(index.occupantsOf(1, 42)).toEqual([3, 9]);
    expect(index.occupantsOf(2, 42)).toEqual([5]);
    expect(index.occupantsOf(1, 7)).toEqual([]);
    expect(index.locationOf(3)).toEqual({ mapId: 1, cellIndex: 42 });
    expect(index.locationOf(99)).toBeNull();
    expect(index.size).toBe(3);
    expect(index.countOnMap(1)).toBe(2);
    expect(index.countOnMap(7)).toBe(0);
  });

  it("returns copies so callers cannot corrupt the index", () => {
    const index = new OccupantIndex();
    index.add(1, { mapId: 1, cellIndex: 0 });
    index.occupantsOf(1, 0).push(77);
    expect(index.occupantsOf(1, 0)).toEqual([1]);
  });

  it("moves within and across maps in one step", () => {
    const index = new OccupantIndex();
    index.add(1, { mapId: 1, cellIndex: 4 });
    expect(index.move(1, { mapId: 1, cellIndex: 5 })).toEqual({ mapId: 1, cellIndex: 4 });
    expect(index.occupantsOf(1, 4)).toEqual([]);
    expect(index.move(1, { mapId: 2, cellIndex: 0 })).toEqual({ mapId: 1, cellIndex: 5 });
    expect(index.countOnMap(1)).toBe(0);
    expect(index.occupantsOf(2, 0)).toEqual([1]);
  });

  it("removes entities and rejects double placement and unknown entities", () => {
    const index = new OccupantIndex();
    index.add(1, { mapId: 1, cellIndex: 4 });
    expect(() => index.add(1, { mapId: 1, cellIndex: 5 })).toThrow(MapError);
    expect(index.remove(1)).toEqual({ mapId: 1, cellIndex: 4 });
    expect(index.size).toBe(0);
    try {
      index.remove(1);
    } catch (failure) {
      expect((failure as MapError).kind).toBe(MapErrorKind.UnknownOccupant);
    }
    expect(() => index.move(2, { mapId: 1, cellIndex: 0 })).toThrow(MapError);
  });

  it("rebuilds from Position components and ignores entities without one", () => {
    const index = new OccupantIndex();
    index.add(50, { mapId: 9, cellIndex: 9 });
    const loose: Entity = { id: 4, prototype: "crate", components: {} };
    index.rebuild([entityAt(1, 1, 3), entityAt(2, 1, 3), loose]);
    expect(index.occupantsOf(1, 3)).toEqual([1, 2]);
    expect(index.locationOf(50)).toBeNull();
    const broken: Entity = {
      id: 6,
      prototype: "x",
      components: { Position: { mapId: "a", cellIndex: 0 } },
    };
    expect(() => index.rebuild([broken])).toThrow(MapError);
  });

  it("clear empties the index", () => {
    const index = new OccupantIndex();
    index.add(1, { mapId: 1, cellIndex: 0 });
    index.clear();
    expect(index.size).toBe(0);
    expect(index.occupantsOf(1, 0)).toEqual([]);
  });
});
