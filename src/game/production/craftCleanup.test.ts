import { describe, expect, it } from "vitest";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { CancelCategory, CancelReason } from "../task/taskTypes";
import { cancelCraftTask, interruptCraft } from "./craftCleanup";
import { craftJobId } from "./productionTypes";
import { createProductionWorld } from "./testProductionWorld";

function crafting() {
  const world = createProductionWorld();
  world.give(world.chest(55), "oak_log", 3);
  const sawmill = world.station("sawmill", 44);
  const settler = world.settler(11);
  world.feed([settler]);
  world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
  for (let tick = 0; tick < 200 && world.data(sawmill).craft === null; tick += 1) {
    world.run(1);
  }
  return { world, sawmill, settler };
}

// @covers 014:FR-011 014:FR-013 014:FR-013a
describe("interruptCraft", () => {
  it("does nothing for an idle workstation", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    expect(interruptCraft(world.engine, sawmill, world.data(sawmill), "x")).toBe(false);
  });

  it("releases the locks, clears the craft and queues production.crafting.interrupted", () => {
    const { world, sawmill, settler } = crafting();
    expect(getStorageService(world.engine).reservations.all()).toHaveLength(1);
    expect(interruptCraft(world.engine, sawmill, world.data(sawmill), "because")).toBe(true);
    expect(world.data(sawmill).craft).toBeNull();
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    world.engine.bus.processQueue();
    expect(world.seen.at(-1)).toMatchObject({
      name: "production.crafting.interrupted",
      payload: {
        workstationId: sawmill.id,
        crafterId: settler.id,
        recipeId: "saw_oak_planks",
        reason: "because",
      },
    });
    expect(world.count("oak_log")).toBe(3);
  });

  it("releases tool reservations as well", () => {
    const { world, sawmill, settler } = crafting();
    const reservations = getStorageService(world.engine).reservations;
    world.give(sawmill, "iron_hammer", 1);
    const tool = reservations.reserve({
      kind: ReservationKind.Tool,
      holderId: settler.id,
      inventoryOwnerId: sawmill.id,
      materialId: "iron_hammer",
      quantity: 1,
    });
    world.data(sawmill).craft?.reservationIds.push(tool.id);
    interruptCraft(world.engine, sawmill, world.data(sawmill), "x");
    expect(reservations.all()).toEqual([]);
  });
});

describe("cancelCraftTask", () => {
  it("cancels the craft task of the posting, false when there is none", () => {
    const { world, sawmill, settler } = crafting();
    const postingId = world.data(sawmill).craft?.postingId ?? 0;
    expect(cancelCraftTask(world.engine, settler.id, postingId + 100)).toBe(false);
    expect(
      cancelCraftTask(world.engine, settler.id, postingId, {
        category: CancelCategory.Graceful,
        reason: CancelReason.InterruptedByPriority,
      }),
    ).toBe(true);
    world.run(1);
    expect(
      world.engine.tasks.getQueue(settler.id)?.tasks.some((task) => task.type === craftJobId),
    ).toBe(false);
    expect(world.data(sawmill).craft).toBeNull();
  });

  it("uses the player token by default", () => {
    const { world, sawmill, settler } = crafting();
    expect(
      cancelCraftTask(world.engine, settler.id, world.data(sawmill).craft?.postingId ?? 0),
    ).toBe(true);
    world.run(1);
    expect(world.seen.at(-1)?.payload).toMatchObject({ reason: "player_cancel" });
  });
});
