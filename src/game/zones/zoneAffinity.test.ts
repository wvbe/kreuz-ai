import { describe, expect, it } from "vitest";
import { noAiOverride } from "../jobs/testJobWorld";
import { createZoneWorld } from "./testZoneWorld";
import { zoneAffinity, zoneWorkers } from "./zoneAffinity";

describe("zoneWorkers", () => {
  it("lists the citizens standing on the zone's tiles, ascending, not other entities", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("farm_field", world.rect(2, 2, 2, 2));
    const first = world.spawn("peasant", 22, noAiOverride);
    const second = world.spawn("farmer", 33, noAiOverride);
    world.spawn("peasant", 24, noAiOverride);
    world.chest(23);
    expect(zoneWorkers(world.engine, zoneId ?? 0)).toEqual([first.id, second.id]);
    expect(zoneWorkers(world.engine, 9999)).toEqual([]);
  });
});

describe("zoneAffinity", () => {
  it("is the best familiarity bucket of the workers in the zone type's skill", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("farm_field", world.rect(2, 2, 2, 2));
    expect(zoneAffinity(world.engine, zoneId ?? 0)).toBe(0);
    world.spawn("peasant", 22, { ...noAiOverride, Skills: { values: { farming: 34000 } } });
    world.spawn("peasant", 23, { ...noAiOverride, Skills: { values: { farming: 61000 } } });
    world.spawn("peasant", 32, { ...noAiOverride, Skills: { values: { baking: 99000 } } });
    expect(zoneAffinity(world.engine, zoneId ?? 0)).toBe(6);
  });

  it("is 0 for a zone type without a skill and for an unknown zone", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("stockpile", [22]);
    world.spawn("peasant", 22, { ...noAiOverride, Skills: { values: { farming: 90000 } } });
    expect(zoneAffinity(world.engine, zoneId ?? 0)).toBe(0);
    expect(zoneAffinity(world.engine, 9999)).toBe(0);
  });
});
