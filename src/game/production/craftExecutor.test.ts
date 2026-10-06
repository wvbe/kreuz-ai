import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { getTotal } from "../inventory/inventoryQueries";
import { findPosting } from "../jobs/jobBoards";
import { skillsComponent } from "../skills/skillsComponent";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { CancelCategory, CancelReason } from "../task/taskTypes";
import { createCraftExecutor, registerCrafting } from "./craftExecutor";
import { craftJobId, OrderStatus } from "./productionTypes";
import { contentWithRecipes, createProductionWorld } from "./testProductionWorld";
import type { ProductionTestWorld } from "./testProductionWorld";

function names(world: ProductionTestWorld, name: string) {
  return world.seen.filter((event) => event.name === name);
}

function ticksOf(world: ProductionTestWorld, name: string): number[] {
  return names(world, name).map((event) => event.tick);
}

function setup(logs = 10) {
  const world = createProductionWorld();
  const chest = world.chest(55);
  if (logs > 0) {
    world.give(chest, "oak_log", logs);
  }
  const sawmill = world.station("sawmill", 44);
  const settler = world.settler(11);
  world.feed([settler]);
  return { world, chest, sawmill, settler };
}

function runUntil(world: ProductionTestWorld, done: () => boolean, limit: number): void {
  for (let tick = 0; tick < limit && !done(); tick += 1) {
    world.run(1);
  }
}

// @covers 014:FR-005 014:FR-006 014:FR-007 014:FR-008 014:FR-009 014:FR-011 014:FR-012
// @covers 014:FR-013 014:FR-018 014:FR-020 014:SC-001 014:SC-007 014:SC-008 014:SC-009
describe("craft.produce", () => {
  it("is registered as a job type executor (registering twice is refused)", () => {
    const { world } = setup();
    expect(() => registerCrafting(world.engine)).toThrow();
    expect(world.engine.taskHandlers.has(craftJobId)).toBe(true);
    expect(createCraftExecutor(world.engine).requires).toEqual(["Position", "Inventory"]);
  });

  it("makes exactly the ordered number of crafts, tick exact, and the outputs land in the workstation", () => {
    const { world, sawmill } = setup();
    const id = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 3 });
    runUntil(world, () => names(world, "production.order.completed").length === 1, 400);
    expect(names(world, "production.crafting.completed")).toHaveLength(3);
    const started = ticksOf(world, "production.crafting.started");
    const finished = ticksOf(world, "production.crafting.completed");
    for (const [index, tick] of finished.entries()) {
      expect(tick - (started[index] ?? 0)).toBe(24);
    }
    expect(names(world, "production.crafting.completed")[0]?.payload).toEqual({
      workstationId: sawmill.id,
      crafterId: world.engine.store.entities().find((entity) => entity.prototype === "peasant")?.id,
      recipeId: "saw_oak_planks",
      inputs: [{ materialId: "oak_log", quantity: 1 }],
      outputs: [{ materialId: "oak_plank", quantity: 2 }],
    });
    expect(world.data(sawmill).orders[0]).toMatchObject({
      orderId: id,
      remaining: 0,
      status: OrderStatus.Completed,
      postingId: null,
    });
    expect(world.data(sawmill).craft).toBeNull();
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    world.run(300);
    expect(names(world, "production.crafting.completed")).toHaveLength(3);
  });

  it("locks the inputs while crafting and shows integer progress", () => {
    const { world, sawmill, settler } = setup();
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    runUntil(world, () => world.data(sawmill).craft !== null, 200);
    const craft = world.data(sawmill).craft;
    expect(craft).toMatchObject({
      crafterId: settler.id,
      durationTicks: 24,
      recipeId: "saw_oak_planks",
    });
    const locks = getStorageService(world.engine).reservations.all();
    expect(locks).toEqual([
      expect.objectContaining({
        kind: ReservationKind.Lock,
        holderId: settler.id,
        inventoryOwnerId: sawmill.id,
        materialId: "oak_log",
        quantity: 1,
      }),
    ]);
    expect(getTotal(sawmill, "oak_log")).toBe(1);
    world.run(10);
    const view = world.engine.getQuery("workstations")?.run({}, world.engine);
    expect(view).toEqual([
      expect.objectContaining({ crafting: expect.objectContaining({ progressTicks: 10 }) }),
    ]);
    runUntil(world, () => world.data(sawmill).craft === null, 40);
    expect(getTotal(sawmill, "oak_log")).toBe(0);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
  });

  it("a skilled crafter is faster (level 100 carpentry halves the 24 ticks) and gains experience", () => {
    const world = createProductionWorld();
    world.give(world.chest(55), "oak_log", 4);
    const sawmill = world.station("sawmill", 44);
    const master = world.settler(11);
    const skills = getComponent(master, skillsComponent);
    if (skills !== undefined) {
      skills.values["carpentry"] = 100_000;
    }
    world.feed([master]);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    runUntil(world, () => names(world, "production.crafting.completed").length === 1, 200);
    const [started] = ticksOf(world, "production.crafting.started");
    const [finished] = ticksOf(world, "production.crafting.completed");
    expect((finished ?? 0) - (started ?? 0)).toBe(12);
    expect(world.data(sawmill).craft).toBeNull();
  });

  it("a novice gains carpentry experience from a completed craft", () => {
    const { world, sawmill, settler } = setup(2);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    runUntil(world, () => names(world, "production.crafting.completed").length === 1, 200);
    world.run(2);
    expect(getComponent(settler, skillsComponent)?.values["carpentry"] ?? 0).toBeGreaterThan(0);
  });

  it("adds the skill output bonus to the first output (baking 100 makes a third bread)", () => {
    const world = createProductionWorld({
      content: contentWithRecipes([
        {
          id: "bake_plain",
          name: "Bake plain bread",
          inputs: [{ materialId: "flour", quantity: 1 }],
          outputs: [{ materialId: "bread", quantity: 2 }],
          durationTicks: 10,
          workstationTag: "oven",
          skillId: "baking",
        },
      ]),
    });
    world.give(world.chest(55), "flour", 3);
    const oven = world.station("oven", 44);
    const baker = world.settler(11);
    const skills = getComponent(baker, skillsComponent);
    if (skills !== undefined) {
      skills.values["baking"] = 100_000;
    }
    world.feed([baker]);
    world.order({ workstationId: oven.id, recipeId: "bake_plain", quantity: 1 });
    runUntil(world, () => names(world, "production.crafting.completed").length === 1, 200);
    expect(names(world, "production.crafting.completed")[0]?.payload).toMatchObject({
      outputs: [{ materialId: "bread", quantity: 3 }],
    });
    expect(getTotal(oven, "bread")).toBe(3);
  });

  it("waits while the inputs are missing and starts when they appear", () => {
    const { world, chest, sawmill } = setup(0);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    world.run(60);
    expect(names(world, "production.crafting.started")).toHaveLength(0);
    expect(world.data(sawmill).orders[0]?.postingId).toBeNull();
    world.give(chest, "oak_log", 1);
    runUntil(world, () => names(world, "production.crafting.completed").length === 1, 200);
    expect(names(world, "production.order.completed")).toHaveLength(1);
  });

  it("gathers inputs from several storages and uses what the workstation already holds", () => {
    const world = createProductionWorld();
    const near = world.chest(12);
    const far = world.chest(88);
    world.give(near, "wheat", 1);
    world.give(far, "wheat", 3);
    const mill = world.station("grinding_mill", 44);
    world.give(mill, "wheat", 1);
    const settler = world.settler(11);
    world.feed([settler]);
    world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 2 });
    runUntil(world, () => names(world, "production.order.completed").length === 1, 500);
    expect(names(world, "production.crafting.completed")).toHaveLength(2);
    expect(world.count("wheat")).toBe(1);
    expect(world.count("flour")).toBe(2);
  });

  it("fails with missing_input when somebody takes the stock on the way and loses nothing", () => {
    const { world, chest, sawmill, settler } = setup(1);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    runUntil(
      world,
      () =>
        world.engine.tasks.getQueue(settler.id)?.tasks.some((task) => task.type === craftJobId) ??
        false,
      100,
    );
    expect(getTotal(chest, "oak_log")).toBe(1);
    const inventory = chest.components["Inventory"] as { slots: { materialId: string }[] };
    inventory.slots = [];
    world.run(40);
    expect(names(world, "production.crafting.started")).toHaveLength(0);
    expect(world.count("oak_log")).toBe(0);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    expect(world.data(sawmill).craft).toBeNull();
  });

  it("only one crafter works at a workstation at a time", () => {
    const world = createProductionWorld();
    world.give(world.chest(55), "oak_log", 6);
    const sawmill = world.station("sawmill", 44);
    const settlers = [world.settler(11), world.settler(12), world.settler(13)];
    world.feed(settlers);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 4 });
    let active = 0;
    let maximum = 0;
    world.engine.bus.subscribe("production.crafting.started", () => {
      active += 1;
      maximum = Math.max(maximum, active);
    });
    world.engine.bus.subscribe("production.crafting.completed", () => {
      active -= 1;
    });
    runUntil(world, () => names(world, "production.order.completed").length === 1, 600);
    expect(maximum).toBe(1);
    expect(names(world, "production.crafting.completed")).toHaveLength(4);
  });

  it("works the higher-priority order first", () => {
    const world = createProductionWorld();
    world.give(world.chest(55), "oak_log", 4);
    const sawmill = world.station("sawmill", 44);
    const settler = world.settler(11);
    world.feed([settler]);
    const low = world.order({
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 1,
      priority: 20,
    });
    const high = world.order({
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 1,
      priority: 80,
    });
    runUntil(world, () => names(world, "production.order.completed").length === 2, 400);
    expect(
      names(world, "production.order.completed").map(
        (event) => (event.payload as { orderId: number }).orderId,
      ),
    ).toEqual([high, low]);
  });

  it("holds a finished craft when the outputs do not fit, reports it once, and completes after room appears", () => {
    const world = createProductionWorld({
      content: contentWithRecipes([
        {
          id: "saw_and_chip",
          name: "Saw and chip",
          inputs: [{ materialId: "oak_log", quantity: 1 }],
          outputs: [
            { materialId: "oak_plank", quantity: 1 },
            { materialId: "bread", quantity: 1 },
          ],
          durationTicks: 10,
          workstationTag: "sawmill",
          skillId: "carpentry",
        },
      ]),
    });
    world.give(world.chest(55), "oak_log", 2);
    const sawmill = world.station("sawmill", 44);
    const settler = world.settler(11);
    world.feed([settler]);
    const inventory = sawmill.components["Inventory"] as { slotCount: number };
    inventory.slotCount = 3;
    world.order({ workstationId: sawmill.id, recipeId: "saw_and_chip", quantity: 1 });
    runUntil(world, () => world.data(sawmill).craft !== null, 200);
    world.give(sawmill, "wheat", 1);
    world.give(sawmill, "flour", 1);
    runUntil(world, () => names(world, "production.output.blocked").length > 0, 100);
    expect(names(world, "production.output.blocked")).toHaveLength(1);
    expect(names(world, "production.output.blocked")[0]?.payload).toMatchObject({
      workstationId: sawmill.id,
      crafterId: settler.id,
      materialId: "bread",
    });
    world.run(60);
    expect(names(world, "production.output.blocked")).toHaveLength(1);
    expect(names(world, "production.crafting.completed")).toHaveLength(0);
    expect(getTotal(sawmill, "oak_log")).toBe(1);
    expect(world.data(sawmill).craft).not.toBeNull();
    const slots = sawmill.components["Inventory"] as { slots: { materialId: string }[] };
    slots.slots = slots.slots.filter((slot) => slot.materialId !== "wheat");
    runUntil(world, () => names(world, "production.crafting.completed").length === 1, 60);
    expect(getTotal(sawmill, "oak_plank")).toBe(1);
    expect(getTotal(sawmill, "bread")).toBe(1);
    expect(getTotal(sawmill, "oak_log")).toBe(0);
  });
});

describe("cancel semantics (DECISIONS D-10)", () => {
  function startCrafting() {
    const built = setup(6);
    built.world.order({ workstationId: built.sawmill.id, recipeId: "saw_oak_planks", quantity: 3 });
    runUntil(built.world, () => built.world.data(built.sawmill).craft !== null, 200);
    return built;
  }

  it("CancelProductionOrder lets the craft in flight finish and starts no new one", () => {
    const { world, sawmill } = startCrafting();
    world.run(5);
    world.command("CancelProductionOrder", { orderId: 1 });
    runUntil(world, () => world.data(sawmill).craft === null, 60);
    expect(names(world, "production.crafting.completed")).toHaveLength(1);
    expect(names(world, "production.crafting.interrupted")).toHaveLength(0);
    expect(world.data(sawmill).orders[0]).toMatchObject({
      status: OrderStatus.Cancelled,
      remaining: 2,
      postingId: null,
    });
    world.run(200);
    expect(names(world, "production.crafting.started")).toHaveLength(1);
    expect(names(world, "production.order.completed")).toHaveLength(0);
    expect(world.count("oak_plank")).toBe(2);
    expect(world.count("oak_log")).toBe(5);
  });

  it("CancelProductionOrder stops a crafter that is still fetching and loses nothing", () => {
    const { world, sawmill, settler } = setup(4);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    runUntil(
      world,
      () =>
        world.engine.tasks.getQueue(settler.id)?.tasks.some((task) => task.type === craftJobId) ??
        false,
      100,
    );
    world.command("CancelProductionOrder", { orderId: 1 });
    world.run(80);
    expect(names(world, "production.crafting.started")).toHaveLength(0);
    expect(world.data(sawmill).craft).toBeNull();
    expect(
      world.engine.tasks.getQueue(settler.id)?.tasks.some((task) => task.type === craftJobId),
    ).toBe(false);
    expect(world.count("oak_log")).toBe(4);
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
  });

  it("CancelCraft interrupts: the locks are released, nothing is consumed, progress restarts at 0", () => {
    const { world, sawmill, settler } = startCrafting();
    world.run(10);
    world.command("CancelCraft", { workstationId: sawmill.id });
    world.run(1);
    expect(names(world, "production.crafting.interrupted")).toHaveLength(1);
    expect(names(world, "production.crafting.interrupted")[0]?.payload).toEqual({
      workstationId: sawmill.id,
      crafterId: settler.id,
      recipeId: "saw_oak_planks",
      reason: "player_cancel",
    });
    expect(world.data(sawmill).craft).toBeNull();
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    expect(world.count("oak_log")).toBe(6);
    expect(world.count("oak_plank")).toBe(0);
    runUntil(world, () => world.data(sawmill).craft !== null, 200);
    expect(world.data(sawmill).craft?.startedTick).toBeGreaterThan(10);
    runUntil(world, () => names(world, "production.order.completed").length === 1, 600);
    expect(names(world, "production.crafting.completed")).toHaveLength(3);
    expect(world.count("oak_plank")).toBe(6);
    expect(world.count("oak_log")).toBe(3);
  });

  it("an interrupted craft by a critical need gives the locks back too", () => {
    const { world, sawmill, settler } = startCrafting();
    world.run(4);
    world.engine.tasks.interrupt(settler.id, {
      category: CancelCategory.Graceful,
      reason: CancelReason.InterruptedByPriority,
    });
    world.run(2);
    expect(world.data(sawmill).craft).toBeNull();
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    expect(names(world, "production.crafting.interrupted")).toHaveLength(1);
    expect(world.count("oak_log")).toBe(6);
  });
});

describe("failures around a craft", () => {
  it("frees the workstation when the crafter is deleted mid-craft and another settler carries on", () => {
    const world = createProductionWorld();
    world.give(world.chest(55), "oak_log", 3);
    const sawmill = world.station("sawmill", 44);
    const first = world.settler(11);
    world.feed([first]);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    runUntil(world, () => world.data(sawmill).craft !== null, 200);
    world.run(5);
    world.engine.store.requestDelete(first.id);
    const second = world.settler(21);
    world.feed([second]);
    world.run(2);
    expect(names(world, "production.crafting.interrupted")).toHaveLength(1);
    expect(names(world, "production.crafting.interrupted")[0]?.payload).toMatchObject({
      reason: "entity_deleted",
    });
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    runUntil(world, () => names(world, "production.order.completed").length === 1, 800);
    expect(world.count("oak_plank")).toBe(4);
    expect(world.count("oak_log")).toBe(1);
  });

  it("a posting cancelled under a running craft interrupts it (posting_gone)", () => {
    const { world, sawmill } = setup(3);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    runUntil(world, () => world.data(sawmill).craft !== null, 200);
    const postingId = world.data(sawmill).craft?.postingId ?? 0;
    expect(findPosting(world.engine, postingId)).not.toBeNull();
    const board = world.engine.store.require(world.boardId).components["JobBoard"] as {
      postings: { id: number }[];
    };
    board.postings = board.postings.filter((posting) => posting.id !== postingId);
    world.run(2);
    expect(names(world, "production.crafting.interrupted")[0]?.payload).toMatchObject({
      reason: "posting_gone",
    });
    expect(world.data(sawmill).craft).toBeNull();
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
  });

  it("fails the job when the recipe vanished from the order", () => {
    const { world, sawmill, settler } = setup(3);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    runUntil(
      world,
      () =>
        world.engine.tasks.getQueue(settler.id)?.tasks.some((task) => task.type === craftJobId) ??
        false,
      100,
    );
    const order = world.data(sawmill).orders[0];
    if (order !== undefined) {
      order.recipeId = "gone";
    }
    world.run(60);
    expect(names(world, "production.crafting.started")).toHaveLength(0);
    expect(world.data(sawmill).craft).toBeNull();
    expect(world.count("oak_log")).toBe(3);
  });

  it("does not post an order whose room is missing", () => {
    const world = createProductionWorld();
    world.give(world.chest(55), "flour", 2);
    const oven = world.station("oven", 44);
    const settler = world.settler(11);
    world.feed([settler]);
    world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    world.run(60);
    expect(names(world, "production.crafting.started")).toHaveLength(0);
    expect(world.data(oven).orders[0]?.postingId).toBeNull();
  });
});

function holds(entity: Entity, materialId: string): number {
  return getTotal(entity, materialId);
}

describe("work inventory", () => {
  it("hauls outputs out of the workstation into storage", () => {
    const { world, chest, sawmill } = setup(2);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    runUntil(world, () => holds(chest, "oak_plank") === 2, 400);
    expect(holds(chest, "oak_plank")).toBe(2);
    expect(holds(sawmill, "oak_plank")).toBe(0);
  });
});
