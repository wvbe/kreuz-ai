import { describe, expect, it } from "vitest";
import { noAiOverride } from "../../src/game/jobs/testJobWorld";
import { RouteTier, chooseRoute, routeCandidates } from "../../src/game/storage/storageRouting";
import type { RouteRequest } from "../../src/game/storage/storageRouting";
import { stockpileComponent } from "../../src/game/storage/stockpileComponent";
import { effectiveFilter } from "../../src/game/storage/materialFilter";
import { createZoneWorld } from "../../src/game/zones/testZoneWorld";
import type { ZoneTestWorld } from "../../src/game/zones/testZoneWorld";

// Spec 018 FR-004 and FR-010 with the zones of task 3.4: tier 0 (deliverToZoneId), tier 1 (skill
// affinity of the zone), the zone filter for storage without a filter of its own, stockpile
// zones and the dwelling exclusion. The hauler stands on cell 55 of the 10x10 test map.
const hauler = 55;

function request(world: ZoneTestWorld, extra: Partial<RouteRequest> = {}): RouteRequest {
  return {
    materialId: "oak_log",
    quantity: 1,
    actorId: null,
    mapId: world.mapId,
    fromCell: hauler,
    ...extra,
  };
}

describe("zone routing tier 0 (deliverToZoneId)", () => {
  it("prefers storage inside the named zone over a nearer, higher-priority stockpile", () => {
    const world = createZoneWorld();
    const near = world.chest(56, { Stockpile: { priority: 90, filter: null } });
    const far = world.chest(18);
    const [zoneId] = world.designate("stockpile", [18]);
    const routes = routeCandidates(world.engine, request(world, { zoneId: zoneId ?? 0 }));
    expect(routes.map((entry) => [entry.entityId, entry.tier])).toEqual([
      [far.id, RouteTier.Zone],
      [near.id, RouteTier.Stockpile],
    ]);
  });

  it("falls back to the other storage when the zone's storage is full or excluded", () => {
    const world = createZoneWorld();
    const near = world.chest(56);
    const far = world.chest(18, { Inventory: { slotCount: 1 } });
    world.give(far, "stone_block", 1);
    const [zoneId] = world.designate("stockpile", [18]);
    expect(chooseRoute(world.engine, request(world, { zoneId: zoneId ?? 0 }))?.entityId).toBe(
      near.id,
    );
  });
});

describe("zone routing tier 1 (skill affinity)", () => {
  function farmWorld() {
    const world = createZoneWorld();
    const plain = world.chest(56);
    const inField = world.chest(19);
    const [zoneId] = world.designate("farm_field", [19, 29]);
    return { world, plain, inField, zoneId: zoneId ?? 0 };
  }

  it("prefers the chest in a zone whose skill the hauler has at level 20 or more", () => {
    const { world, plain, inField } = farmWorld();
    const farmer = world.spawn("peasant", hauler, {
      ...noAiOverride,
      Skills: { values: { farming: 20000 } },
    });
    const routes = routeCandidates(world.engine, request(world, { actorId: farmer.id }));
    expect(routes.map((entry) => [entry.entityId, entry.tier])).toEqual([
      [inField.id, RouteTier.Affinity],
      [plain.id, RouteTier.Stockpile],
    ]);
  });

  it("gives no preference to a hauler below the level or with another skill", () => {
    const { world, plain, inField } = farmWorld();
    const novice = world.spawn("peasant", hauler, {
      ...noAiOverride,
      Skills: { values: { farming: 19999, baking: 90000 } },
    });
    const routes = routeCandidates(world.engine, request(world, { actorId: novice.id }));
    expect(routes.map((entry) => entry.entityId)).toEqual([plain.id, inField.id]);
    expect(routes.every((entry) => entry.tier === RouteTier.Stockpile)).toBe(true);
  });

  it("works while the zone is inactive (storage affinity needs no effects)", () => {
    const { world, inField, zoneId } = farmWorld();
    world.run(1);
    expect(world.zoneData(zoneId).active).toBe(false);
    const farmer = world.spawn("peasant", hauler, {
      ...noAiOverride,
      Skills: { values: { farming: 50000 } },
    });
    expect(chooseRoute(world.engine, request(world, { actorId: farmer.id }))?.entityId).toBe(
      inField.id,
    );
  });

  it("ranks tier 0 above tier 1", () => {
    const { world, plain, inField } = farmWorld();
    const [stockZone] = world.designate("stockpile", [56]);
    const farmer = world.spawn("peasant", hauler, {
      ...noAiOverride,
      Skills: { values: { farming: 50000 } },
    });
    const routes = routeCandidates(
      world.engine,
      request(world, { actorId: farmer.id, zoneId: stockZone ?? 0 }),
    );
    expect(routes.map((entry) => [entry.entityId, entry.tier])).toEqual([
      [plain.id, RouteTier.Zone],
      [inField.id, RouteTier.Affinity],
    ]);
  });
});

describe("zone filter and stockpile zones", () => {
  it("applies the zone filter to storage without a filter of its own", () => {
    const world = createZoneWorld();
    const chest = world.chest(56);
    const [zoneId] = world.designate("stockpile", [56]);
    world.command("SetZoneMaterialFilter", {
      zoneId: zoneId ?? 0,
      filter: { categories: ["food"] },
    });
    expect(effectiveFilter(world.engine, chest)).toEqual({ categories: ["food"], materialIds: [] });
    expect(chooseRoute(world.engine, request(world))).toBeNull();
    const food = chooseRoute(world.engine, request(world, { materialId: "bread" }));
    expect(food).toMatchObject({ entityId: chest.id, tier: RouteTier.Filtered });
  });

  it("lets the storage's own filter override the zone filter", () => {
    const world = createZoneWorld();
    const chest = world.chest(56, {
      Stockpile: { priority: 50, filter: { categories: [], materialIds: ["oak_log"] } },
    });
    const [zoneId] = world.designate("stockpile", [56]);
    world.command("SetZoneMaterialFilter", {
      zoneId: zoneId ?? 0,
      filter: { categories: ["food"] },
    });
    expect(chooseRoute(world.engine, request(world))?.entityId).toBe(chest.id);
    expect(chooseRoute(world.engine, request(world, { materialId: "bread" }))).toBeNull();
  });

  it("removes the zone filter with null and ignores an empty one", () => {
    const world = createZoneWorld();
    const chest = world.chest(56);
    const [zoneId] = world.designate("stockpile", [56]);
    world.command("SetZoneMaterialFilter", {
      zoneId: zoneId ?? 0,
      filter: { categories: ["food"] },
    });
    world.command("SetZoneMaterialFilter", { zoneId: zoneId ?? 0, filter: null });
    expect(effectiveFilter(world.engine, chest)).toBeNull();
    world.command("SetZoneMaterialFilter", { zoneId: zoneId ?? 0, filter: { categories: [] } });
    expect(effectiveFilter(world.engine, chest)).toBeNull();
  });

  it("treats furniture storage in a stockpile zone as a stockpile", () => {
    const world = createZoneWorld();
    const chest = world.chest(56);
    world.engine.store.removeComponent(chest.id, stockpileComponent);
    expect(chooseRoute(world.engine, request(world))?.tier).toBe(RouteTier.Open);
    world.designate("stockpile", [56]);
    expect(chooseRoute(world.engine, request(world))?.tier).toBe(RouteTier.Stockpile);
  });

  it("never offers furniture on dwelling tiles (spec 029 FR-017)", () => {
    const world = createZoneWorld();
    const plain = world.chest(18);
    world.chest(56);
    world.designate("dwelling", [56]);
    expect(routeCandidates(world.engine, request(world)).map((entry) => entry.entityId)).toEqual([
      plain.id,
    ]);
  });
});
