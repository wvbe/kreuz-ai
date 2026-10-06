import { describe, expect, it } from "vitest";
import { moodComponent } from "../ai/mood/moodComponent";
import { updateMood } from "../ai/mood/runMood";
import { getComponent } from "../ecs/Entity";
import { positionComponent } from "../map/positionComponent";
import { noAiOverride } from "../jobs/testJobWorld";
import { contentWithZones, createZoneWorld } from "./testZoneWorld";
import {
  activeZonesOfType,
  isActivityPermittedAt,
  isInActiveZoneOfType,
  zoneAt,
  zoneModifierMilliFor,
  zoneOfEntity,
} from "./zoneQueries";

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

const bonusHall = {
  id: "test_hall",
  name: "Test hall",
  requiresRoom: false,
  minTiles: 1,
  activityUnlocks: ["test_feasting"],
  effects: [{ modifierId: "mood.bonus", value: 5 }],
};

// @covers 015:FR-009 015:FR-010 015:SC-004
describe("zone effects", () => {
  it("permits an activity only inside an active zone that unlocks it, from the next tick", () => {
    const world = createZoneWorld({ content: contentWithZones([bonusHall]) });
    world.designate("test_hall", [30, 31]);
    expect(isActivityPermittedAt(world.engine, world.mapId, 30, "test_feasting")).toBe(false);
    world.run(2);
    expect(isActivityPermittedAt(world.engine, world.mapId, 30, "test_feasting")).toBe(true);
    expect(isActivityPermittedAt(world.engine, world.mapId, 30, "other")).toBe(false);
    expect(isActivityPermittedAt(world.engine, world.mapId, 32, "test_feasting")).toBe(false);
  });

  it("applies an entity modifier while the entity stands in the zone and drops it on leaving", () => {
    const world = createZoneWorld({ content: contentWithZones([bonusHall]) });
    world.designate("test_hall", [30, 31]);
    const settler = world.spawn("peasant", 30, noAiOverride);
    world.run(2);
    expect(zoneModifierMilliFor(world.engine, settler.id, "mood.bonus")).toBe(5000);
    expect(zoneModifierMilliFor(world.engine, settler.id, "faith.bonus")).toBe(0);
    world.engine.maps.moveEntity(settler.id, 40);
    const place = getComponent(settler, positionComponent);
    if (place !== undefined) {
      place.cellIndex = 40;
    }
    expect(zoneModifierMilliFor(world.engine, settler.id, "mood.bonus")).toBe(0);
    expect(zoneModifierMilliFor(world.engine, 9999, "mood.bonus")).toBe(0);
  });

  it("lifts the mood of a citizen who stands in a zone with a mood.bonus effect", () => {
    const world = createZoneWorld({ content: contentWithZones([bonusHall]) });
    world.designate("test_hall", [30]);
    const inside = world.spawn("peasant", 30, noAiOverride);
    const outside = world.spawn("peasant", 50, noAiOverride);
    world.run(2);
    for (const settler of [inside, outside]) {
      for (let tick = 0; tick < 200; tick += 1) {
        updateMood(world.engine, settler, tick);
      }
    }
    const moodOf = (entity: typeof inside) => getComponent(entity, moodComponent)?.valueMilli ?? 0;
    expect(moodOf(inside)).toBeGreaterThan(moodOf(outside));
  });

  it("answers correctly for 120 active zones on one map (SC-004)", () => {
    const world = createZoneWorld({
      content: contentWithZones([bonusHall]),
      width: 30,
      height: 30,
    });
    const cells = Array.from({ length: 120 }, (_, index) => index * 2 + 100);
    for (const cell of cells) {
      world.designate("test_hall", [cell]);
    }
    world.run(2);
    const permitted = cells.filter((cell) =>
      isActivityPermittedAt(world.engine, world.mapId, cell, "test_feasting"),
    );
    expect(permitted).toHaveLength(120);
    expect(isActivityPermittedAt(world.engine, world.mapId, 101, "test_feasting")).toBe(false);
  });
});
