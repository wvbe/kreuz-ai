import { describe, expect, it, vi } from "vitest";
import { getComponent } from "../ecs/Entity";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { getStorageService } from "./storageServiceRegistry";
import { createStorageWorld } from "./testStorageWorld";
import type { StorageTestWorld } from "./testStorageWorld";

function breadRemaining(world: StorageTestWorld, entityId: number): number {
  const slot = getComponent(world.engine.store.require(entityId), inventoryComponent)?.slots[0];
  return slot?.remainingMilli ?? -1;
}

describe("StorageService reported goods", () => {
  it("marks once, keeps entries sorted and retains only wanted ones", () => {
    const service = getStorageService(createStorageWorld().engine);
    expect(service.markReported(7, "oak_log")).toBe(true);
    expect(service.markReported(7, "oak_log")).toBe(false);
    expect(service.markReported(3, "wheat")).toBe(true);
    expect(service.markReported(3, "oak_log")).toBe(true);
    expect(service.reported()).toEqual([
      { entityId: 3, materialId: "oak_log" },
      { entityId: 3, materialId: "wheat" },
      { entityId: 7, materialId: "oak_log" },
    ]);
    expect(service.isReported(3, "wheat")).toBe(true);
    service.retainReported((entry) => entry.entityId === 7);
    expect(service.reported()).toEqual([{ entityId: 7, materialId: "oak_log" }]);
    expect(service.isReported(3, "wheat")).toBe(false);
  });

  it("saves the marks in systems.storage and defaults to none for older saves", () => {
    const world = createStorageWorld();
    const service = getStorageService(world.engine);
    service.markReported(7, "oak_log");
    const saved = world.engine.saveGame();
    expect(JSON.parse(saved).systems.storage).toEqual({
      reported: [{ entityId: 7, materialId: "oak_log" }],
    });
    const other = createStorageWorld();
    other.engine.loadGame(saved);
    expect(getStorageService(other.engine).reported()).toEqual(service.reported());
    expect(service.createSection().defaultForOlderSaves?.()).toEqual({ reported: [] });
  });
});

describe("StorageService.decayModifierMilli and addDecayModifierSource", () => {
  it("is neutral for plain furniture and citizens", () => {
    const world = createStorageWorld();
    const service = getStorageService(world.engine);
    expect(service.decayModifierMilli(world.chest(5))).toBe(1000);
    expect(service.decayModifierMilli(world.spawn("peasant", 6))).toBe(1000);
  });

  it("multiplies the inventory.decay.rate effects of the furniture content", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    const record = world.engine.content.furniture.require("chest");
    vi.spyOn(world.engine.content.furniture, "find").mockReturnValue({
      ...record,
      effects: [
        { modifierId: "inventory.decay.rate", value: 500 },
        { modifierId: "inventory.decay.rate", value: 500 },
        { modifierId: "mood.bonus", value: 5000 },
      ],
    });
    expect(getStorageService(world.engine).decayModifierMilli(chest)).toBe(250);
  });

  it("combines registered sources by product; null means not applicable; 0 stops decay", () => {
    const world = createStorageWorld();
    const service = getStorageService(world.engine);
    const chest = world.chest(5);
    service.addDecayModifierSource(() => null);
    service.addDecayModifierSource((_engine, entity) => (entity.id === chest.id ? 500 : null));
    expect(service.decayModifierMilli(chest)).toBe(500);
    service.addDecayModifierSource(() => 0);
    expect(service.decayModifierMilli(chest)).toBe(0);
  });

  it("drives the decay of the items inside storage (slot 3), perishables only", () => {
    const world = createStorageWorld();
    const plain = world.chest(5);
    const slow = world.chest(6);
    const frozen = world.chest(7);
    for (const chest of [plain, slow, frozen]) {
      world.give(chest, "bread", 4);
      world.give(chest, "oak_log", 4);
    }
    getStorageService(world.engine).addDecayModifierSource((_engine, entity) =>
      entity.id === slow.id ? 500 : entity.id === frozen.id ? 0 : null,
    );
    const start = breadRemaining(world, plain.id);
    world.run(100);
    expect(start - breadRemaining(world, plain.id)).toBe(100_000);
    expect(start - breadRemaining(world, slow.id)).toBe(50_000);
    expect(start - breadRemaining(world, frozen.id)).toBe(0);
    const logs = getComponent(plain, inventoryComponent)?.slots.find(
      (slot) => slot.materialId === "oak_log",
    );
    expect(logs?.remainingMilli).toBeNull();
  });

  it("expires bread after its lifetime in plain storage and half as fast in slow storage", () => {
    const world = createStorageWorld();
    const plain = world.chest(5);
    const slow = world.chest(6);
    world.give(plain, "bread", 4);
    world.give(slow, "bread", 4);
    getStorageService(world.engine).addDecayModifierSource((_engine, entity) =>
      entity.id === slow.id ? 500 : null,
    );
    world.run(864);
    expect(getComponent(plain, inventoryComponent)?.slots).toEqual([]);
    expect(getComponent(slow, inventoryComponent)?.slots[0]?.quantity).toBe(4);
    world.run(864);
    expect(getComponent(slow, inventoryComponent)?.slots).toEqual([]);
  });
});

describe("StorageService.setZoneRouteProvider and zoneRouteAt", () => {
  it("asks the provider for the zone of a cell; null means no zones", () => {
    const world = createStorageWorld();
    const service = getStorageService(world.engine);
    const info = {
      zoneId: 9,
      zoneTypeId: "stockpile",
      stockpile: true,
      excluded: false,
      filter: null,
      skillId: null,
    };
    service.setZoneRouteProvider((mapId, cell) => (cell === 4 ? { ...info, zoneId: mapId } : null));
    expect(service.zoneRouteAt(world.mapId, 4)).toEqual({ ...info, zoneId: world.mapId });
    expect(service.zoneRouteAt(world.mapId, 5)).toBeNull();
    service.setZoneRouteProvider(null);
    expect(service.zoneRouteAt(world.mapId, 4)).toBeNull();
  });
});

describe("StorageService zone preference", () => {
  it("steers a material into the zone the installed rule names", () => {
    const service = getStorageService(createStorageWorld().engine);
    expect(service.preferredZone("bread")).toBeNull();
    service.setZonePreference((materialId) => (materialId === "bread" ? 12 : null));
    expect(service.preferredZone("bread")).toBe(12);
    expect(service.preferredZone("flour")).toBeNull();
  });
});
