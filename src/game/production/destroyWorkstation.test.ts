import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { destroyWorkstation, workstationDestroyedReason } from "./destroyWorkstation";
import { OrderStatus } from "./productionTypes";
import { createProductionWorld } from "./testProductionWorld";

describe("destroyWorkstation", () => {
  it("does nothing for an entity that is no workstation", () => {
    const world = createProductionWorld();
    const chest = world.chest(50);
    expect(destroyWorkstation(world.engine, chest)).toBeNull();
  });

  it("returns null when an idle workstation holds nothing", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    expect(destroyWorkstation(world.engine, sawmill)).toBeNull();
  });

  it("deleting a workstation cancels its orders and drops the contents as a loose pile", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    world.give(sawmill, "oak_plank", 4);
    world.give(sawmill, "oak_log", 2);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    world.engine.store.requestDelete(sawmill.id);
    world.engine.store.flushDeletions();
    world.engine.bus.processQueue();
    const pile = world.engine.store.entities().find((entity) => entity.prototype === "loose_pile");
    expect(pile).toBeDefined();
    expect(world.count("oak_plank")).toBe(4);
    expect(world.count("oak_log")).toBe(2);
    expect(pile !== undefined && getTotal(pile, "oak_plank")).toBe(4);
    expect(world.seen.map((event) => event.name)).toEqual([
      "production.order.created",
      "production.order.cancelled",
    ]);
  });

  it("interrupts a running craft, stops the crafter and cancels its posting", () => {
    const world = createProductionWorld();
    world.give(world.chest(55), "oak_log", 3);
    const sawmill = world.station("sawmill", 44);
    const settler = world.settler(11);
    world.feed([settler]);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 2 });
    for (let tick = 0; tick < 200 && world.data(sawmill).craft === null; tick += 1) {
      world.run(1);
    }
    const postingId = world.data(sawmill).craft?.postingId ?? 0;
    world.engine.store.requestDelete(sawmill.id);
    world.engine.store.flushDeletions();
    world.engine.bus.processQueue();
    expect(world.data(sawmill).craft).toBeNull();
    const interrupted = world.seen.find(
      (event) => event.name === "production.crafting.interrupted",
    );
    expect(interrupted?.payload).toMatchObject({ reason: workstationDestroyedReason });
    expect(getStorageService(world.engine).reservations.all()).toEqual([]);
    const history = (
      world.engine.store.require(world.boardId).components["JobBoard"] as {
        history: { id: number; reason: string }[];
      }
    ).history;
    expect(history.find((posting) => posting.id === postingId)?.reason).toBe(
      workstationDestroyedReason,
    );
    expect(
      world.data(sawmill).orders.every((order) => order.status === OrderStatus.Cancelled),
    ).toBe(true);
    expect(world.count("oak_log")).toBe(3);
    expect(world.engine.store.entities().some((entity) => entity.prototype === "loose_pile")).toBe(
      true,
    );
  });
});
