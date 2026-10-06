import { describe, expect, it } from "vitest";
import { decayInventories, decayInventory, neutralDecayModifiers } from "./inventoryDecay";
import { store } from "./inventoryOperations";
import { getTotal, requireInventory } from "./inventoryQueries";
import { createInventoryEntity, createTestContext } from "./testInventories";

describe("neutralDecayModifiers", () => {
  it("are 1000 permille each", () => {
    expect(neutralDecayModifiers).toEqual({ zoneModifierMilli: 1000, difficultyDecayMilli: 1000 });
  });
});

describe("decayInventory", () => {
  // @covers 005:FR-021
  // @covers 005:SC-010
  it("US8 AC1: a 576 tick cheese stack expires on exactly tick 576 and emits the event", () => {
    const { context, bus, events } = createTestContext();
    const entity = createInventoryEntity(1);
    store(context, entity, "cheese", 10);
    bus.processQueue();
    events.length = 0;
    for (let tick = 1; tick <= 575; tick += 1) {
      expect(decayInventory(entity, bus)).toEqual([]);
    }
    expect(getTotal(entity, "cheese")).toBe(10);
    expect(requireInventory(entity).slots[0]?.remainingMilli).toBe(1000);
    expect(decayInventory(entity, bus)).toEqual([{ materialId: "cheese", quantity: 10 }]);
    expect(getTotal(entity, "cheese")).toBe(0);
    bus.processQueue();
    expect(events).toEqual([
      {
        name: "inventory.item.expired",
        payload: { entityId: 1, materialId: "cheese", quantity: 10 },
      },
    ]);
  });

  it("US8 AC3: stacks expire independently", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    store(context, entity, "cheese", 20);
    for (let tick = 0; tick < 100; tick += 1) {
      decayInventory(entity, undefined);
    }
    store(context, entity, "cheese", 5);
    for (let tick = 0; tick < 476; tick += 1) {
      decayInventory(entity, undefined);
    }
    expect(requireInventory(entity).slots).toHaveLength(1);
    expect(requireInventory(entity).slots[0]).toMatchObject({
      quantity: 5,
      remainingMilli: 100000,
    });
  });

  it("US8 AC4: non-perishables never expire", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    store(context, entity, "wood", 5);
    for (let tick = 0; tick < 2000; tick += 1) {
      decayInventory(entity, undefined);
    }
    expect(getTotal(entity, "wood")).toBe(5);
  });

  // @covers 005:FR-020
  it("scales by zone, difficulty and the stack decay rate", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    store(context, entity, "cheese", 1);
    decayInventory(entity, undefined, { zoneModifierMilli: 500, difficultyDecayMilli: 1000 });
    expect(requireInventory(entity).slots[0]?.remainingMilli).toBe(576000 - 500);
    decayInventory(entity, undefined, { zoneModifierMilli: 500, difficultyDecayMilli: 1500 });
    expect(requireInventory(entity).slots[0]?.remainingMilli).toBe(576000 - 500 - 750);
    requireInventory(entity).slots[0]!.decayRateMilli = 2000;
    decayInventory(entity, undefined);
    expect(requireInventory(entity).slots[0]?.remainingMilli).toBe(576000 - 500 - 750 - 2000);
  });

  it("a zero modifier stops decay and entities without inventory are ignored", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    store(context, entity, "cheese", 1);
    decayInventory(entity, undefined, { zoneModifierMilli: 0, difficultyDecayMilli: 1000 });
    expect(requireInventory(entity).slots[0]?.remainingMilli).toBe(576000);
    expect(decayInventory({ id: 2, prototype: "rock", components: {} }, undefined)).toEqual([]);
  });

  // @covers 005:FR-026
  it("US8 AC5: remaining time survives JSON exactly", () => {
    const { context } = createTestContext();
    const entity = createInventoryEntity(1);
    store(context, entity, "cheese", 3);
    decayInventory(entity, undefined, { zoneModifierMilli: 333, difficultyDecayMilli: 777 });
    const copy = JSON.parse(JSON.stringify(requireInventory(entity)));
    expect(copy).toEqual(requireInventory(entity));
  });
});

describe("decayInventories", () => {
  it("decays every entity and applies per-entity modifiers", () => {
    const { context, bus, events } = createTestContext();
    const first = createInventoryEntity(1);
    const second = createInventoryEntity(2);
    store(context, first, "cheese", 1);
    store(context, second, "cheese", 1);
    decayInventories(
      [first, second, { id: 3, prototype: "rock", components: {} }],
      bus,
      (entity) =>
        entity.id === 2
          ? { zoneModifierMilli: 500, difficultyDecayMilli: 1000 }
          : neutralDecayModifiers,
    );
    expect(requireInventory(first).slots[0]?.remainingMilli).toBe(575000);
    expect(requireInventory(second).slots[0]?.remainingMilli).toBe(575500);
    bus.processQueue();
    expect(events.filter((event) => event.name === "inventory.item.expired")).toEqual([]);
    decayInventories([first], undefined);
    expect(requireInventory(first).slots[0]?.remainingMilli).toBe(574000);
  });
});
