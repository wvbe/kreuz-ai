import { describe, expect, it } from "vitest";
import type { Entity } from "../../src/game/ecs/Entity";
import { getTotal } from "../../src/game/inventory/inventoryQueries";
import { explainOrder } from "../../src/game/production/productionBlockers";
import { OrderStatus, ProductionBlockedKind } from "../../src/game/production/productionTypes";
import type { CraftItem } from "../../src/game/production/productionTypes";
import {
  contentWithRecipes,
  createProductionWorld,
} from "../../src/game/production/testProductionWorld";
import type { ProductionTestWorld } from "../../src/game/production/testProductionWorld";
import { getStorageService } from "../../src/game/storage/storageServiceRegistry";

// Plan 3.3 acceptance: items are never duplicated or lost while settlers craft, however often
// orders are cancelled and crafts interrupted; variants, rooms and save/load behave per DECISIONS
// D-10.

const tracked = ["wheat", "flour", "oak_log", "oak_plank"];

function build() {
  const world = createProductionWorld();
  const source = world.chest(55);
  world.give(source, "wheat", 20);
  world.give(source, "oak_log", 20);
  world.chest(58);
  const mill = world.station("grinding_mill", 44);
  const sawmill = world.station("sawmill", 66);
  const settlers = [world.settler(11), world.settler(22), world.settler(33)];
  world.feed(settlers);
  return { world, source, mill, sawmill, settlers };
}

function balance(world: ProductionTestWorld) {
  const delta = new Map<string, number>(tracked.map((id) => [id, 0]));
  world.engine.bus.subscribe("production.crafting.completed", (payload) => {
    const done = payload as { inputs: CraftItem[]; outputs: CraftItem[] };
    for (const item of done.inputs) {
      delta.set(item.materialId, (delta.get(item.materialId) ?? 0) - item.quantity);
    }
    for (const item of done.outputs) {
      delta.set(item.materialId, (delta.get(item.materialId) ?? 0) + item.quantity);
    }
  });
  return delta;
}

// @covers 014:FR-003 014:FR-014 014:FR-015 014:FR-017 014:FR-020 014:SC-002 014:SC-006
// @covers 014:SC-005
describe("item conservation", () => {
  it("never loses or duplicates an item over 500 ticks of crafting with cancels and interrupts", () => {
    const { world, mill, sawmill, settlers } = build();
    const delta = balance(world);
    const initial = new Map(tracked.map((id) => [id, world.count(id)]));
    const grind = world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 6 });
    const saw = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 8 });
    let interrupted = 0;
    let cancelledOrders = 0;
    for (let tick = 1; tick <= 500; tick += 1) {
      if (tick % 97 === 0) {
        world.feed(settlers);
      }
      if (tick % 60 === 0 && world.data(mill).craft !== null) {
        world.command("CancelCraft", { workstationId: mill.id });
        interrupted += 1;
      }
      if (tick === 150) {
        world.command("CancelProductionOrder", { orderId: saw });
        cancelledOrders += 1;
      }
      if (tick === 170) {
        world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 4 });
      }
      if (tick === 230) {
        world.command("SetProductionOrderPaused", { orderId: grind, paused: true });
      }
      if (tick === 260) {
        world.command("SetProductionOrderPaused", { orderId: grind, paused: false });
      }
      if (tick === 300 && world.data(sawmill).craft !== null) {
        world.engine.tasks.interrupt(world.data(sawmill).craft?.crafterId ?? 0);
        interrupted += 1;
      }
      world.run(1);
      for (const id of tracked) {
        expect(world.count(id), `${id} at tick ${tick}`).toBe(
          (initial.get(id) ?? 0) + (delta.get(id) ?? 0),
        );
      }
      for (const reservation of getStorageService(world.engine).reservations.all()) {
        expect(world.engine.store.has(reservation.holderId)).toBe(true);
        expect(
          getTotal(
            world.engine.store.require(reservation.inventoryOwnerId),
            reservation.materialId,
          ),
        ).toBeGreaterThanOrEqual(reservation.quantity);
      }
    }
    const finished = world.engine.getQuery("production-orders")?.run({}, world.engine);
    expect(Array.isArray(finished)).toBe(true);
    expect(interrupted).toBeGreaterThan(0);
    expect(cancelledOrders).toBe(1);
    expect(world.data(mill).orders[0]?.status).toBe(OrderStatus.Completed);
    expect(world.data(sawmill).orders[0]?.status).toBe(OrderStatus.Cancelled);
    expect(
      world.seen.filter((event) => event.name === "production.crafting.completed").length,
    ).toBeGreaterThan(8);
    expect(world.seen.some((event) => event.name === "production.crafting.interrupted")).toBe(true);
  });

  it("is deterministic: the same run twice ends in the same state", () => {
    const run = () => {
      const { world, mill, sawmill } = build();
      world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 3 });
      world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 3 });
      world.run(300);
      return world.engine.getStateHash();
    };
    expect(run()).toBe(run());
  });
});

describe("save and load in the middle of a craft", () => {
  it("continues identically", () => {
    const start = () => {
      const built = build();
      built.world.order({ workstationId: built.mill.id, recipeId: "grind_flour", quantity: 3 });
      built.world.order({
        workstationId: built.sawmill.id,
        recipeId: "saw_oak_planks",
        quantity: 3,
      });
      return built;
    };
    const reference = start();
    reference.world.run(260);
    const first = start();
    let saved = "";
    for (let tick = 1; tick <= 260; tick += 1) {
      first.world.run(1);
      const crafting =
        first.world.data(first.mill).craft !== null &&
        first.world.data(first.sawmill).craft !== null;
      if (crafting && first.world.engine.time.tickCount > 40) {
        saved = first.world.engine.saveGame();
        first.world.run(260 - tick);
        break;
      }
    }
    expect(saved).not.toBe("");
    expect(first.world.engine.getStateHash()).toBe(reference.world.engine.getStateHash());
    const resumed = createProductionWorld();
    resumed.engine.loadGame(saved);
    const savedTick = resumed.engine.time.tickCount;
    expect(savedTick).toBeGreaterThan(40);
    const [millAfter] = resumed.engine.store
      .entities()
      .filter((entity) => entity.prototype === "grinding_mill");
    expect(millAfter?.components["ProductionOrders"]).toMatchObject({
      craft: expect.objectContaining({ recipeId: "grind_flour" }),
    });
    resumed.run(260 - savedTick);
    expect(resumed.engine.getStateHash()).toBe(reference.world.engine.getStateHash());
    expect(resumed.engine.saveGame()).toBe(reference.world.engine.saveGame());
  });
});

describe("recipe variants are separate recipes", () => {
  it("lets the player pick the variant by recipe id at the same workstation", () => {
    const world = createProductionWorld({
      content: contentWithRecipes([
        {
          id: "saw_fine_planks",
          name: "Saw fine planks",
          inputs: [{ materialId: "oak_log", quantity: 2 }],
          outputs: [{ materialId: "oak_plank", quantity: 5 }],
          durationTicks: 30,
          workstationTag: "sawmill",
          skillId: "carpentry",
        },
      ]),
    });
    world.give(world.chest(55), "oak_log", 10);
    world.chest(58);
    const sawmill = world.station("sawmill", 66);
    world.feed([world.settler(11)]);
    const recipes = world.engine
      .getQuery("recipes-for")
      ?.run({ workstationId: sawmill.id }, world.engine);
    expect((recipes as { id: string }[]).map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["saw_oak_planks", "saw_fine_planks"]),
    );
    world.order({
      workstationId: sawmill.id,
      recipeId: "saw_fine_planks",
      quantity: 1,
      priority: 80,
    });
    world.order({
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 1,
      priority: 40,
    });
    world.run(300);
    const crafted = world.seen
      .filter((event) => event.name === "production.crafting.completed")
      .map((event) => event.payload as { recipeId: string; outputs: CraftItem[] });
    expect(crafted.map((entry) => entry.recipeId)).toEqual(["saw_fine_planks", "saw_oak_planks"]);
    expect(crafted[0]?.outputs).toEqual([{ materialId: "oak_plank", quantity: 5 }]);
    expect(world.count("oak_plank")).toBe(7);
    expect(world.count("oak_log")).toBe(7);
  });
});

describe("room restriction uses active zones", () => {
  function bakery() {
    const world = createProductionWorld();
    world.chest(90);
    world.give(world.chest(91), "flour", 6);
    const cells = world.rect(2, 2, 2, 2);
    const oven = world.station("oven", cells[0] ?? 0);
    // Walls obstruct the cells (task 3.5): the crafter walks in through a door.
    const walls = world.walls(2, 2, 2, 2, [31]);
    world.door(31);
    world.designate("bakery", cells);
    world.feed([world.settler(77)]);
    return { world, oven, walls };
  }

  it("bakes only while the oven stands in an active bakery, and resumes when it is restored", () => {
    const { world, oven, walls } = bakery();
    world.run(3);
    const id = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 4 });
    expect(explainOrder(world.engine, id).reasons).toEqual([]);
    const crafts = () =>
      world.seen.filter((event) => event.name === "production.crafting.completed").length;
    for (let tick = 0; tick < 400 && crafts() < 1; tick += 1) {
      world.run(1);
    }
    expect(crafts()).toBe(1);
    const gap = walls.get(21) as Entity;
    world.engine.store.requestDelete(gap.id);
    world.run(2);
    expect(explainOrder(world.engine, id).reasons.map((reason) => reason.kind)).toContain(
      ProductionBlockedKind.MissingRoom,
    );
    const during = crafts();
    world.run(200);
    expect(crafts()).toBeLessThanOrEqual(during + 1);
    const stalled = crafts();
    world.run(100);
    expect(crafts()).toBe(stalled);
    world.wall(21);
    world.run(3);
    expect(explainOrder(world.engine, id).reasons).toEqual([]);
    for (
      let tick = 0;
      tick < 600 && world.data(oven).orders[0]?.status !== OrderStatus.Completed;
      tick += 1
    ) {
      world.run(1);
    }
    expect(world.data(oven).orders[0]?.status).toBe(OrderStatus.Completed);
    expect(world.count("flour")).toBe(2);
  });
});
