import { describe, expect, it } from "vitest";
import { findPosting, requireBoard } from "../jobs/jobBoards";
import { pauseBoard } from "../jobs/boardPause";
import { EligibilityKind, PauseSource } from "../jobs/jobTypes";
import { getStorageService } from "../storage/storageServiceRegistry";
import { haulJobId, ReservationKind } from "../storage/storageTypes";
import { postCraftJobs, postOutputHauls, sweepStaleCrafts } from "./productionPoster";
import { craftJobId, productionPosterIntervalTicks } from "./productionTypes";
import { contentWithRecipes, createProductionWorld } from "./testProductionWorld";
import type { ProductionTestWorld } from "./testProductionWorld";

function postingsOf(world: ProductionTestWorld, jobTypeId: string) {
  return requireBoard(world.engine, world.boardId).data.postings.filter(
    (posting) => posting.jobTypeId === jobTypeId,
  );
}

function sawWorld(logs = 6, withChest = true) {
  const world = createProductionWorld();
  const chest = world.chest(withChest ? 55 : 99);
  if (withChest && logs > 0) {
    world.give(chest, "oak_log", logs);
  }
  if (!withChest) {
    world.engine.store.requestDelete(chest.id);
    world.engine.store.flushDeletions();
  }
  const sawmill = world.station("sawmill", 44);
  world.settler(11);
  return { world, chest, sawmill };
}

describe("postCraftJobs", () => {
  it("posts one craft job for the order on the interval, naming the workstation", () => {
    const { world, sawmill } = sawWorld();
    const id = world.order({
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 2,
      priority: 65,
    });
    expect(postCraftJobs(world.engine, 1)).toEqual([]);
    const created = postCraftJobs(world.engine, productionPosterIntervalTicks);
    expect(created).toHaveLength(1);
    const posting = postingsOf(world, craftJobId)[0];
    expect(posting).toMatchObject({
      id: created[0],
      priority: 65,
      target: { entityId: sawmill.id, cellIndex: 44, materialId: null },
    });
    expect(world.data(sawmill).orders[0]).toMatchObject({ orderId: id, postingId: created[0] });
    expect(posting?.eligibility.map((entry) => entry.kind)).toEqual([
      EligibilityKind.AdultHumanoid,
      EligibilityKind.NotHostileToPoster,
    ]);
  });

  it("posts nothing a second time while a posting is out or a craft runs", () => {
    const { world, sawmill } = sawWorld();
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    expect(postCraftJobs(world.engine, 6)).toHaveLength(1);
    expect(postCraftJobs(world.engine, 12)).toEqual([]);
    expect(postingsOf(world, craftJobId)).toHaveLength(1);
  });

  it("posts the highest-priority order that nothing blocks", () => {
    const { world, sawmill } = sawWorld();
    const oven = world.station("oven", 45);
    const blocked = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    const low = world.order({
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 1,
      priority: 10,
    });
    const high = world.order({
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 1,
      priority: 90,
    });
    postCraftJobs(world.engine, 6);
    const postings = world
      .data(sawmill)
      .orders.map((order) => [order.orderId, order.postingId !== null]);
    expect(postings).toEqual([
      [low, false],
      [high, true],
    ]);
    expect(
      world.data(oven).orders.find((order) => order.orderId === blocked)?.postingId,
    ).toBeNull();
  });

  it("adds the MinSkill predicate for a recipe with a required level", () => {
    const world = createProductionWorld({
      content: contentWithRecipes([
        {
          id: "fine_planks",
          name: "Fine planks",
          inputs: [{ materialId: "oak_log", quantity: 1 }],
          outputs: [{ materialId: "oak_plank", quantity: 3 }],
          durationTicks: 10,
          workstationTag: "sawmill",
          skillId: "carpentry",
          minSkillLevel: 20,
        },
      ]),
    });
    world.give(world.chest(55), "oak_log", 2);
    const sawmill = world.station("sawmill", 44);
    const settler = world.settler(11);
    const skills = settler.components["Skills"] as { values: { [skill: string]: number } };
    skills.values["carpentry"] = 20_000;
    world.order({ workstationId: sawmill.id, recipeId: "fine_planks", quantity: 1 });
    postCraftJobs(world.engine, 6);
    expect(postingsOf(world, craftJobId)[0]?.eligibility).toContainEqual({
      kind: EligibilityKind.MinSkill,
      skillId: "carpentry",
      level: 20,
    });
  });

  it("forgets a posting that vanished and posts again; waits when no board runs", () => {
    const { world, sawmill } = sawWorld();
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    expect(postCraftJobs(world.engine, 6)).toEqual([]);
    expect(postingsOf(world, craftJobId)).toHaveLength(0);
    const resumed = world.engine.store.require(world.boardId).components["JobBoard"] as {
      pausedByPlayer: boolean;
    };
    resumed.pausedByPlayer = false;
    const [first] = postCraftJobs(world.engine, 12);
    const board = requireBoard(world.engine, world.boardId).data;
    board.postings = board.postings.filter((posting) => posting.id !== first);
    const [second] = postCraftJobs(world.engine, 18);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(world.data(sawmill).orders[0]?.postingId).toBe(second);
  });

  it("does nothing for paused or finished orders and idle workstations", () => {
    const { world, sawmill } = sawWorld();
    const id = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    world.command("SetProductionOrderPaused", { orderId: id, paused: true });
    expect(postCraftJobs(world.engine, 6)).toEqual([]);
  });
});

describe("postOutputHauls", () => {
  it("posts a haul for outputs but keeps the inputs an unfinished order needs", () => {
    const { world, sawmill } = sawWorld(0);
    world.give(sawmill, "oak_plank", 3);
    world.give(sawmill, "oak_log", 2);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    expect(postOutputHauls(world.engine, 1)).toEqual([]);
    const created = postOutputHauls(world.engine, 6);
    expect(created).toHaveLength(1);
    expect(postingsOf(world, haulJobId)[0]).toMatchObject({
      id: created[0],
      target: { entityId: sawmill.id, materialId: "oak_plank" },
    });
    expect(postOutputHauls(world.engine, 12)).toEqual([]);
  });

  it("hauls leftovers once no order needs them any more, never the locked units", () => {
    const { world, sawmill } = sawWorld(0, false);
    const settler = world.settler(21);
    world.give(sawmill, "oak_log", 3);
    const id = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    world.command("CancelProductionOrder", { orderId: id });
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Lock,
      holderId: settler.id,
      inventoryOwnerId: sawmill.id,
      materialId: "oak_log",
      quantity: 3,
    });
    expect(postOutputHauls(world.engine, 6)).toEqual([]);
    getStorageService(world.engine).reservations.releaseHolder(settler.id);
    expect(postOutputHauls(world.engine, 12)).toHaveLength(0);
    world.chest(55);
    expect(postOutputHauls(world.engine, 18)).toHaveLength(1);
  });

  it("skips goods without an accepting storage and waits for a running board", () => {
    const { world, sawmill } = sawWorld(0, false);
    world.give(sawmill, "oak_plank", 1);
    expect(postOutputHauls(world.engine, 6)).toEqual([]);
    world.chest(55);
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    expect(postOutputHauls(world.engine, 12)).toEqual([]);
  });
});

describe("sweepStaleCrafts", () => {
  function crafting() {
    const built = sawWorld(3);
    built.world.feed(
      built.world.engine.store.entities().filter((entity) => entity.prototype === "peasant"),
    );
    built.world.order({ workstationId: built.sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    for (let tick = 0; tick < 200 && built.world.data(built.sawmill).craft === null; tick += 1) {
      built.world.run(1);
    }
    return built;
  }

  it("leaves a healthy craft alone", () => {
    const { world } = crafting();
    expect(sweepStaleCrafts(world.engine)).toBe(0);
  });

  it("interrupts a craft whose crafter is gone (crafter_lost)", () => {
    const { world, sawmill } = crafting();
    const craft = world.data(sawmill).craft;
    if (craft !== null) {
      craft.crafterId = 9999;
    }
    expect(sweepStaleCrafts(world.engine)).toBe(1);
    expect(world.data(sawmill).craft).toBeNull();
    world.engine.bus.processQueue();
    expect(world.seen.at(-1)?.payload).toMatchObject({ reason: "crafter_lost" });
  });

  it("interrupts a craft whose posting is gone (posting_gone) or whose task is gone", () => {
    const { world, sawmill } = crafting();
    const postingId = world.data(sawmill).craft?.postingId ?? 0;
    const board = requireBoard(world.engine, world.boardId).data;
    const kept = board.postings;
    board.postings = kept.filter((posting) => posting.id !== postingId);
    expect(findPosting(world.engine, postingId)).toBeNull();
    expect(sweepStaleCrafts(world.engine)).toBe(1);
    world.engine.bus.processQueue();
    expect(world.seen.at(-1)?.payload).toMatchObject({ reason: "posting_gone" });
  });

  it("interrupts a craft whose crafter lost its craft task", () => {
    const { world, sawmill } = crafting();
    const crafterId = world.data(sawmill).craft?.crafterId ?? 0;
    const queue = world.engine.tasks.getQueue(crafterId);
    if (queue !== undefined) {
      queue.tasks = queue.tasks.filter((task) => task.type !== craftJobId);
    }
    expect(sweepStaleCrafts(world.engine)).toBe(1);
    world.engine.bus.processQueue();
    expect(world.seen.at(-1)?.payload).toMatchObject({ reason: "crafter_lost" });
  });

  it("interrupts a craft whose posting was taken by somebody else", () => {
    const { world, sawmill } = crafting();
    const postingId = world.data(sawmill).craft?.postingId ?? 0;
    const found = findPosting(world.engine, postingId);
    if (found !== null) {
      found.posting.claimantId = 9999;
    }
    expect(sweepStaleCrafts(world.engine)).toBe(1);
  });
});
