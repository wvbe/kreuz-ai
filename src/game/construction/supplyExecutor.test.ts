import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { requireSite } from "./buildSiteQueries";
import { cancelSite } from "./constructionSites";
import { createSupplyExecutor, registerSupply } from "./supplyExecutor";
import { createConstructionWorld } from "./testConstructionWorld";

function setup(stone = 2) {
  const world = createConstructionWorld();
  const chest = world.chest(55);
  if (stone > 0) {
    world.give(chest, "stone_block", stone);
  }
  const settler = world.settler(11);
  world.feed([settler]);
  const job = world.place("wall", 44);
  return { world, chest, settler, job };
}

function supplyTask(world: ReturnType<typeof createConstructionWorld>, entityId: number) {
  return world.engine.tasks.getQueue(entityId)?.tasks.find((task) => task.type === "build.supply");
}

describe("build.supply", () => {
  it("is registered as a job type executor (registering twice is refused)", () => {
    const { world } = setup();
    expect(() => registerSupply(world.engine)).toThrow();
    expect(world.engine.taskHandlers.has("build.supply")).toBe(true);
    expect(createSupplyExecutor(world.engine).requires).toEqual(["Position", "Inventory"]);
  });

  it("carries the missing material from storage to the site in one reserved trip", () => {
    const { world, chest, settler, job } = setup();
    const reservations = getStorageService(world.engine).reservations;
    world.runUntil(() => reservations.ofHolder(settler.id).length > 0, 100);
    // The supplier holds a reservation on the chest until it picks the goods up.
    expect(reservations.ofHolder(settler.id)[0]).toMatchObject({
      kind: ReservationKind.Supply,
      inventoryOwnerId: chest.id,
      quantity: 1,
    });
    expect(requireSiteSupplier(world, job)).toBe(settler.id);
    world.runUntil(() => getTotal(requireSite(world.engine, job).entity, "stone_block") === 1, 200);
    expect(getTotal(chest, "stone_block")).toBe(1);
    expect(getTotal(settler, "stone_block")).toBe(0);
    expect(requireSiteSupplier(world, job)).toBeNull();
    expect(reservations.ofHolder(settler.id)).toEqual([]);
  });

  it("delivers in several trips when the site needs more than one trip brings", () => {
    const world = createConstructionWorld();
    const chest = world.chest(55);
    world.stockFor(chest, "chest");
    const settler = world.settler(11);
    world.feed([settler]);
    const job = world.place("chest", 44);
    world.runUntil(() => requireSite(world.engine, job).data.status === "building", 600);
    expect(getTotal(requireSite(world.engine, job).entity, "oak_plank")).toBe(4);
    expect(getTotal(requireSite(world.engine, job).entity, "nails")).toBe(2);
  });

  it("gives carried goods back as a pile and releases the reservation when the site is cancelled", () => {
    const { world, settler, job } = setup();
    world.runUntil(() => supplyTask(world, settler.id) !== undefined, 100);
    world.run(3);
    cancelSite(world.engine, job);
    world.run(1);
    expect(supplyTask(world, settler.id)).toBeUndefined();
    expect(getStorageService(world.engine).reservations.ofHolder(settler.id)).toEqual([]);
    expect(world.count("stone_block")).toBe(2);
  });

  it("never delivers more than the site needs and keeps the surplus", () => {
    const { world, settler, job } = setup();
    world.runUntil(() => supplyTask(world, settler.id) !== undefined, 100);
    world.give(requireSite(world.engine, job).entity, "stone_block", 1);
    world.run(300);
    // The site was completed from the 1 given unit; what the supplier fetched went back.
    expect(world.engine.store.entities().some((entity) => entity.prototype === "wall")).toBe(true);
    expect(world.count("stone_block")).toBe(2);
  });
});

function requireSiteSupplier(world: ReturnType<typeof createConstructionWorld>, job: number) {
  return requireSite(world.engine, job).data.supplierId;
}
