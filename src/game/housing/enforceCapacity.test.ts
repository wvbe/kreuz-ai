import { describe, expect, it } from "vitest";
import { dwellingOf } from "./dwellingZones";
import { enforceCapacity, evictionOrder, evictResident } from "./enforceCapacity";
import { assignHome, residentsOf } from "./household";
import { createHousingWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

describe("evictionOrder", () => {
  it("puts the latest assignment first and the higher id first on ties (FR-012)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const [first, second, third] = [world.settler(170), world.settler(171), world.settler(172)];
    assignHome(world.engine, first.id, zone, 10);
    assignHome(world.engine, second.id, zone, 30);
    assignHome(world.engine, third.id, zone, 30);
    expect(evictionOrder(residentsOf(world.engine, zone)).map((entity) => entity.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
  });
});

describe("evictResident", () => {
  it("clears the home and queues the event with the reason", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const settler = world.settler(170);
    assignHome(world.engine, settler.id, zone, 0);
    const evicted = world.record("housing.resident.evicted");
    evictResident(world.engine, settler.id, zone, "DwellingChanged" as never);
    world.run(1);
    expect(world.residents(zone)).toEqual([]);
    expect(evicted).toEqual([
      { dwellingId: zone, entityId: settler.id, reason: "DwellingChanged" },
    ]);
  });
});

describe("enforceCapacity", () => {
  it("evicts the residents beyond min(level capacity, beds) with CapacityReduced", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const people = [world.settler(170), world.settler(171), world.settler(172)];
    people.forEach((person, index) => assignHome(world.engine, person.id, zone, 5 + index));
    const record = dwellingOf(world.engine, zone);
    const evicted = enforceCapacity(
      world.engine,
      record ?? fail(),
      residentsOf(world.engine, zone),
    );
    expect(evicted).toEqual([people[2]?.id]);
    expect(world.residents(zone)).toEqual([people[0]?.id, people[1]?.id]);
  });

  it("changes nothing at or below capacity", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    assignHome(world.engine, world.settler(170).id, zone, 5);
    const record = dwellingOf(world.engine, zone);
    expect(
      enforceCapacity(world.engine, record ?? fail(), residentsOf(world.engine, zone)),
    ).toEqual([]);
  });
});

function fail(): never {
  throw new Error("no dwelling");
}
