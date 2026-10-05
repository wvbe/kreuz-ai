import { describe, expect, it } from "vitest";
import { noAiOverride } from "../jobs/testJobWorld";
import { createZoneWorld } from "./testZoneWorld";
import { activeZonesOfType, isInActiveZoneOfType, zoneAt, zoneOfEntity } from "./zoneQueries";

describe("zoneAt", () => {
  it("is the zone of a cell, or null for unzoned cells (FR-016)", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("stockpile", [22, 23]);
    expect(zoneAt(world.engine, world.mapId, 22)).toBe(zoneId);
    expect(zoneAt(world.engine, world.mapId, 24)).toBeNull();
    expect(zoneAt(world.engine, 99, 22)).toBeNull();
  });
});

describe("zoneOfEntity", () => {
  it("follows the entity's position", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("stockpile", [22]);
    const inside = world.spawn("peasant", 22, noAiOverride);
    const outside = world.spawn("peasant", 24, noAiOverride);
    expect(zoneOfEntity(world.engine, inside.id)).toBe(zoneId);
    expect(zoneOfEntity(world.engine, outside.id)).toBeNull();
    expect(zoneOfEntity(world.engine, 9999)).toBeNull();
    const zoneEntity = zoneOfEntity(world.engine, zoneId ?? 0);
    expect(zoneEntity).toBeNull();
  });
});

describe("activeZonesOfType", () => {
  it("lists only active zones of the type, ascending", () => {
    const world = createZoneWorld();
    const [first] = world.designate("stockpile", [11]);
    const [second] = world.designate("stockpile", [55]);
    world.designate("farm_field", [77]);
    world.run(1);
    expect(activeZonesOfType(world.engine, "stockpile")).toEqual([first, second]);
    expect(activeZonesOfType(world.engine, "farm_field")).toEqual([]);
    expect(activeZonesOfType(world.engine, "nope")).toEqual([]);
  });
});

describe("isInActiveZoneOfType", () => {
  it("holds from the tick after the zone became active, for the right type only", () => {
    const world = createZoneWorld();
    world.designate("stockpile", [11]);
    expect(isInActiveZoneOfType(world.engine, world.mapId, 11, "stockpile")).toBe(false);
    world.run(1);
    expect(isInActiveZoneOfType(world.engine, world.mapId, 11, "stockpile")).toBe(false);
    world.run(1);
    expect(isInActiveZoneOfType(world.engine, world.mapId, 11, "stockpile")).toBe(true);
    expect(isInActiveZoneOfType(world.engine, world.mapId, 11, "bakery")).toBe(false);
    expect(isInActiveZoneOfType(world.engine, world.mapId, 12, "stockpile")).toBe(false);
  });
});
