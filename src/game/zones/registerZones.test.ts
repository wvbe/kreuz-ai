import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import type { GameEngine } from "../engine/GameEngine";
import { getStorageService } from "../storage/storageServiceRegistry";
import { registerZones } from "./registerZones";
import { createZoneWorld } from "./testZoneWorld";
import { getZoneService } from "./zoneServiceRegistry";

function query(engine: GameEngine, name: string, args: JsonValue): JsonValue {
  const registration = engine.getQuery(name);
  if (registration === undefined) {
    throw new Error(`no query ${name}`);
  }
  return registration.run(args, engine);
}

describe("registerZones", () => {
  it("is idempotent and returns the engine's service", () => {
    const world = createZoneWorld();
    expect(registerZones(world.engine)).toBe(getZoneService(world.engine));
  });

  it("hooks the zones into storage routing", () => {
    const world = createZoneWorld();
    world.designate("stockpile", [22]);
    expect(getStorageService(world.engine).zoneRouteAt(world.mapId, 22)).toMatchObject({
      zoneTypeId: "stockpile",
      stockpile: true,
      excluded: false,
    });
    expect(getStorageService(world.engine).zoneRouteAt(world.mapId, 23)).toBeNull();
  });

  it("DesignateZone, AddZoneTiles, RemoveZoneTiles and DeleteZone change the zone", () => {
    const world = createZoneWorld();
    const created = world.command("DesignateZone", {
      zoneTypeId: "stockpile",
      mapId: world.mapId,
      cells: [22, 23],
    }) as { zoneIds: number[] };
    const zoneId = created.zoneIds[0] ?? 0;
    expect(world.command("AddZoneTiles", { zoneId, cells: [24] })).toEqual({
      zoneId,
      newZoneIds: [],
    });
    expect(world.command("RemoveZoneTiles", { zoneId, cells: [22] })).toEqual({
      zoneId,
      newZoneIds: [],
    });
    expect(world.zoneData(zoneId).tiles).toEqual([23, 24]);
    expect(world.command("DeleteZone", { zoneId })).toEqual({ zoneId });
    expect(() => world.command("DeleteZone", { zoneId })).toThrow("not a zone");
  });

  it("rejects bad payloads and unknown references", () => {
    const world = createZoneWorld();
    expect(() =>
      world.command("DesignateZone", { zoneTypeId: "stockpile", mapId: 1, cells: [] }),
    ).toThrow();
    expect(() =>
      world.command("DesignateZone", { zoneTypeId: "stockpile", mapId: 1, cells: [1], extra: 1 }),
    ).toThrow();
    expect(() => world.command("AddZoneTiles", { zoneId: 999, cells: [1] })).toThrow("not a zone");
    expect(() => world.command("ConfirmZoneMerge", { offerId: 1, accept: true })).toThrow(
      "does not exist",
    );
    expect(() => world.command("SetZoneMaterialFilter", { zoneId: 999, filter: null })).toThrow(
      "not a zone",
    );
  });

  it("SetZoneMaterialFilter validates categories and stores a normalized filter", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("stockpile", [22]);
    expect(() =>
      world.command("SetZoneMaterialFilter", {
        zoneId: zoneId ?? 0,
        filter: { categories: ["nonsense"] },
      }),
    ).toThrow("nonsense");
    world.command("SetZoneMaterialFilter", {
      zoneId: zoneId ?? 0,
      filter: { materialIds: ["oak_log", "oak_log"], categories: ["food"] },
    });
    expect(world.zoneData(zoneId ?? 0).filter).toEqual({
      categories: ["food"],
      materialIds: ["oak_log"],
    });
  });

  it("answers the queries zones, zone, zone-at and zone-merge-offers", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("stockpile", [22, 23]);
    world.run(1);
    const zones = query(world.engine, "zones", {}) as { id: number; status: string }[];
    expect(zones.map((zone) => [zone.id, zone.status])).toEqual([[zoneId, "active"]]);
    expect(query(world.engine, "zones", { mapId: 99 })).toEqual([]);
    expect(query(world.engine, "zone", { zoneId: zoneId ?? 0 })).toMatchObject({
      id: zoneId,
      tiles: [22, 23],
    });
    expect(query(world.engine, "zone", { zoneId: 999 })).toBeNull();
    expect(query(world.engine, "zone-at", { mapId: world.mapId, cellIndex: 23 })).toMatchObject({
      id: zoneId,
    });
    expect(query(world.engine, "zone-at", { mapId: world.mapId, cellIndex: 24 })).toBeNull();
    expect(query(world.engine, "zone-merge-offers", {})).toEqual([]);
  });

  it("rebuilds the cell index silently after a load", () => {
    const world = createZoneWorld();
    const [zoneId] = world.designate("stockpile", [22]);
    world.run(1);
    const text = world.engine.saveGame();
    world.events.length = 0;
    world.engine.loadGame(text);
    expect(getZoneService(world.engine).zoneIdAt(world.mapId, 22)).toBe(zoneId);
    world.run(1);
    expect(world.events).toEqual([]);
  });
});
