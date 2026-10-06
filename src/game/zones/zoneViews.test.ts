import { describe, expect, it } from "vitest";
import { createZoneWorld } from "./testZoneWorld";
import { buildMergeOffers, buildZoneView, buildZoneViews } from "./zoneViews";
import { ZoneStatus } from "./zoneTypes";

// @covers 015:FR-016 015:FR-017
describe("buildZoneView", () => {
  it("copies the zone state with affinity and workers; null for unknown ids", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("farm_field", world.rect(2, 2, 2, 1));
    world.command("SetZoneMaterialFilter", {
      zoneId: zoneId ?? 0,
      filter: { categories: ["food"] },
    });
    world.run(1);
    const view = buildZoneView(world.engine, zoneId ?? 0);
    expect(view).toMatchObject({
      id: zoneId,
      zoneTypeId: "farm_field",
      mapId: world.mapId,
      tiles: [22, 23],
      isRoom: false,
      active: false,
      status: ZoneStatus.Inactive,
      filter: { categories: ["food"], materialIds: [] },
      affinity: 0,
      workers: [],
    });
    expect(view?.gaps).toHaveLength(1);
    view?.tiles.push(99);
    expect(world.zoneData(zoneId ?? 0).tiles).toEqual([22, 23]);
    expect(buildZoneView(world.engine, 9999)).toBeNull();
  });
});

describe("buildZoneViews", () => {
  it("lists zones ascending, optionally of one map", () => {
    const world = createZoneWorld();
    const [first] = world.designate("stockpile", [11]);
    const [second] = world.designate("stockpile", [55]);
    expect(buildZoneViews(world.engine).map((view) => view.id)).toEqual([first, second]);
    expect(buildZoneViews(world.engine, world.mapId)).toHaveLength(2);
    expect(buildZoneViews(world.engine, 99)).toEqual([]);
  });
});

describe("buildMergeOffers", () => {
  it("is empty without offers", () => {
    const world = createZoneWorld();
    expect(buildMergeOffers(world.engine)).toEqual([]);
  });
});
