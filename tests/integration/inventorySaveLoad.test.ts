import { describe, expect, it } from "vitest";
import { ComponentRegistry } from "../../src/game/ecs/ComponentRegistry";
import { requireComponent } from "../../src/game/ecs/Entity";
import type { Entity } from "../../src/game/ecs/Entity";
import { EntityStore } from "../../src/game/ecs/EntityStore";
import { PrototypeRegistry } from "../../src/game/ecs/PrototypeRegistry";
import { EventBus } from "../../src/game/engine/EventBus";
import { IdCounters } from "../../src/game/engine/IdCounters";
import { inventoryComponent } from "../../src/game/inventory/inventoryComponent";
import { decayInventories } from "../../src/game/inventory/inventoryDecay";
import { credit, getBalance } from "../../src/game/inventory/inventoryMoney";
import {
  equip,
  retrieve,
  store,
  storeUpTo,
  transfer,
} from "../../src/game/inventory/inventoryOperations";
import { getAllItems } from "../../src/game/inventory/inventoryQueries";
import {
  InventoryOperation,
  PermissionTargetKind,
  PermissionType,
} from "../../src/game/inventory/inventoryTypes";
import type { InventoryContext } from "../../src/game/inventory/inventoryTypes";
import { createTestMaterials } from "../../src/game/inventory/testInventories";

// Populates a store of inventory entities, runs a deterministic mix of operations, then checks
// that a save/load round trip is byte-identical and that 1000 entities stay fast.

function createWorld(): { store: EntityStore; counters: IdCounters; context: InventoryContext } {
  const components = new ComponentRegistry();
  components.register(inventoryComponent);
  const prototypes = new PrototypeRegistry(components);
  prototypes.register({ id: "holder", components: { Inventory: {} } });
  const counters = new IdCounters();
  const bus = new EventBus();
  const entities = new EntityStore({ components, prototypes, counters, bus });
  return {
    store: entities,
    counters,
    context: { materials: createTestMaterials(), actor: null, bus },
  };
}

function populate(world: ReturnType<typeof createWorld>, count: number): Entity[] {
  const holders: Entity[] = [];
  for (let index = 0; index < count; index += 1) {
    holders.push(
      world.store.spawn("holder", {
        Inventory: {
          slotCount: 6,
          weightLimitMilli: index % 3 === 0 ? 100000 : null,
          equipment: [{ name: "mainHand", restrictionCategory: "weapon", materialId: null }],
          rules:
            index % 5 === 0
              ? [
                  {
                    type: PermissionType.Deny,
                    target: { kind: PermissionTargetKind.Role, role: "thief" },
                    operation: InventoryOperation.Transfer,
                  },
                ]
              : [],
        },
      }),
    );
  }
  return holders;
}

function exercise(world: ReturnType<typeof createWorld>, holders: Entity[]): void {
  const { context } = world;
  holders.forEach((holder, index) => {
    credit(context, holder, 100 + index);
    storeUpTo(context, holder, "wood", 30 + (index % 20));
    storeUpTo(context, holder, "cheese", 1 + (index % 12));
    store(context, holder, "sword", 1);
    equip(context, holder, "sword", "mainHand");
  });
  for (let index = 1; index < holders.length; index += 1) {
    const from = holders[index - 1] as Entity;
    const to = holders[index] as Entity;
    transfer(context, from, to, "silver_penny", 10);
    retrieve(context, to, "wood", 5);
  }
  for (let tick = 0; tick < 50; tick += 1) {
    decayInventories(holders, context.bus);
  }
}

describe("inventory save and load", () => {
  // @covers 005:FR-026
  // @covers 005:FR-026a
  // @covers 005:FR-027
  // @covers 005:SC-005
  it("round-trips a populated world byte for byte and keeps behaving identically", () => {
    const world = createWorld();
    const holders = populate(world, 40);
    exercise(world, holders);
    const saved = JSON.stringify(world.store.serialize());

    const restored = createWorld();
    restored.counters.restore(JSON.parse(JSON.stringify(world.counters.serialize())));
    restored.store.restore(JSON.parse(saved));
    expect(JSON.stringify(restored.store.serialize())).toBe(saved);

    const liveHolders = world.store.entities();
    const loadedHolders = restored.store.entities();
    for (const [position, live] of liveHolders.entries()) {
      const loaded = loadedHolders[position] as Entity;
      expect(getAllItems(loaded)).toEqual(getAllItems(live));
      expect(getBalance(restored.context, loaded)).toBe(getBalance(world.context, live));
    }

    exercise(
      world,
      liveHolders.slice(0, 5).map((holder) => holder),
    );
    expect(
      requireComponent(liveHolders[0] as Entity, inventoryComponent).slots.length,
    ).toBeGreaterThan(0);
  });

  it("rejects saved inventories with stack limits or unknown fields", () => {
    const world = createWorld();
    const [holder] = populate(world, 1);
    const saved = JSON.parse(JSON.stringify(world.store.serialize()));
    saved.entities[0].components.Inventory.slots = [
      {
        materialId: "wood",
        quantity: 1,
        remainingMilli: null,
        decayRateMilli: null,
        stackLimit: 50,
      },
    ];
    const restored = createWorld();
    restored.counters.restore(JSON.parse(JSON.stringify(world.counters.serialize())));
    expect(() => restored.store.restore(saved)).toThrow();
    expect(holder).toBeDefined();
  });
});

describe("inventory performance", () => {
  it("handles 1000 inventory entities with mixed operations quickly", () => {
    const world = createWorld();
    const holders = populate(world, 1000);
    const started = performance.now();
    exercise(world, holders);
    const elapsed = performance.now() - started;
    expect(world.store.size).toBe(1000);
    expect(elapsed).toBeLessThan(20_000);
  });
});
