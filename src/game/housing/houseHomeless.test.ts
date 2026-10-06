import { describe, expect, it } from "vitest";
import { DwellingLevel } from "../content/contentTypes";
import { listDwellings } from "./dwellingZones";
import { assignHome, homelessCitizens, residentsByDwelling } from "./household";
import { freeDwellings, houseHomeless } from "./houseHomeless";
import { createHousingWorld } from "./testHousingWorld";

const options = { width: 20, height: 12 };

describe("freeDwellings", () => {
  it("lists active dwellings with room, highest level first, ties by id", () => {
    const world = createHousingWorld(options);
    const first = world.dwelling(1, 2, { beds: 2 });
    const second = world.dwelling(6, 2, { beds: 2 });
    const third = world.dwelling(11, 2, { beds: 1 });
    world.setLevel(third, DwellingLevel.Cottage);
    const settler = world.settler(200);
    assignHome(world.engine, settler.id, third, 0);
    const dwellings = listDwellings(world.engine);
    const list = freeDwellings(world.engine, dwellings, residentsByDwelling(world.engine));
    expect(list.map((entry) => [entry.record.entity.id, entry.free])).toEqual([
      [first, 2],
      [second, 2],
    ]);
    world.setLevel(second, DwellingLevel.Cottage);
    const reordered = freeDwellings(world.engine, dwellings, residentsByDwelling(world.engine));
    expect(reordered.map((entry) => entry.record.entity.id)).toEqual([second, first]);
  });
});

describe("houseHomeless", () => {
  it("fills the best dwelling first and uses the free slots up (FR-014)", () => {
    const world = createHousingWorld(options);
    const low = world.dwelling(1, 2, { beds: 2 });
    const high = world.dwelling(6, 2, { beds: 1 });
    world.setLevel(high, DwellingLevel.Cottage);
    const people = [world.settler(200), world.settler(201), world.settler(202), world.settler(203)];
    const free = freeDwellings(
      world.engine,
      listDwellings(world.engine),
      residentsByDwelling(world.engine),
    );
    const housed = houseHomeless(world.engine, free, homelessCitizens(world.engine), 5);
    expect(housed).toEqual([people[0]?.id, people[1]?.id, people[2]?.id]);
    expect(world.residents(high)).toEqual([people[0]?.id]);
    expect(world.residents(low)).toEqual([people[1]?.id, people[2]?.id]);
    expect(free.every((entry) => entry.free === 0)).toBe(true);
    expect(homelessCitizens(world.engine).map((entity) => entity.id)).toEqual([people[3]?.id]);
  });
});
