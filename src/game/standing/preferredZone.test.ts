import { describe, expect, it } from "vitest";
import { chooseRoute } from "../storage/storageRouting";
import { getStorageService } from "../storage/storageServiceRegistry";
import { preferredZone } from "./preferredZone";
import { createStandingWorld } from "./testStandingWorld";

describe("preferredZone", () => {
  it("is the zone of a restocking, live, unpaused zone order for the material", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const zoneId = world.zone("stockpile", [100, 101]);
    const id = world.standing({ materialId: "bread", scope: { zoneId } });
    expect(preferredZone(world.engine, "bread")).toBeNull();
    const order = world.orderOf(id);
    order.restocking = true;
    expect(preferredZone(world.engine, "bread")).toBe(zoneId);
    expect(preferredZone(world.engine, "flour")).toBeNull();
    order.paused = true;
    expect(preferredZone(world.engine, "bread")).toBeNull();
    order.paused = false;
    world.command("DeleteZone", { zoneId });
    world.run(2);
    expect(preferredZone(world.engine, "bread")).toBeNull();
  });

  it("ignores settlement orders", () => {
    const world = createStandingWorld();
    const id = world.standing({ materialId: "bread" });
    world.orderOf(id).restocking = true;
    expect(preferredZone(world.engine, "bread")).toBeNull();
  });

  // @covers 026:FR-020
  it("makes storage routing rank the zone's chest first and keep the others as fallback (FR-020)", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const near = world.chest(5 * 20 + 6);
    const zoneId = world.zone("stockpile", [100, 101]);
    const inside = world.chest(100);
    world.run(1);
    const routeOf = () =>
      chooseRoute(world.engine, {
        materialId: "bread",
        quantity: 1,
        actorId: null,
        mapId: world.mapId,
        fromCell: 5 * 20 + 5,
      });
    expect(routeOf()?.entityId).toBe(near.id);
    const id = world.standing({ materialId: "bread", scope: { zoneId } });
    world.orderOf(id).restocking = true;
    expect(getStorageService(world.engine).preferredZone("bread")).toBe(zoneId);
    expect(routeOf()?.entityId).toBe(inside.id);
    world.give(inside, "bread", 1);
    expect(inside.id).toBeGreaterThan(0);
  });
});
