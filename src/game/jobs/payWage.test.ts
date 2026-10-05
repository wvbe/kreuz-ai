import { describe, expect, it } from "vitest";
import { getBalance } from "../inventory/inventoryMoney";
import { claimPosting } from "./jobPostings";
import { getJobService } from "./jobServiceRegistry";
import { payWage } from "./payWage";
import { createJobWorld, noAiOverride } from "./testJobWorld";

function coins(world: ReturnType<typeof createJobWorld>, id: number): number {
  return getBalance(
    { materials: world.engine.materials, actor: null },
    world.engine.store.require(id),
  );
}

describe("payWage", () => {
  it("mints the wage into the worker's inventory by default", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(15, { wage: 4 });
    claimPosting(world.engine, posting.id, worker.id, 0);
    const before = coins(world, worker.id);
    expect(payWage(world.engine, worker.id, posting)).toBe(true);
    expect(coins(world, worker.id) - before).toBe(4);
  });

  it("transfers nothing for wage 0", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(15, { wage: 0 });
    const before = coins(world, worker.id);
    expect(payWage(world.engine, worker.id, posting)).toBe(true);
    expect(coins(world, worker.id)).toBe(before);
  });

  it("hands the payment to a custom payer when one is set", () => {
    const world = createJobWorld();
    const worker = world.spawn("peasant", 5, noAiOverride);
    const posting = world.postFell(15, { wage: 4 });
    const paid: number[] = [];
    getJobService(world.engine).setWagePayer((_engine, _workerId, wage) => paid.push(wage));
    const before = coins(world, worker.id);
    expect(payWage(world.engine, worker.id, posting)).toBe(true);
    expect(paid).toEqual([4]);
    expect(coins(world, worker.id)).toBe(before);
  });

  it("warns and pays nothing when the worker is gone or cannot hold the coins", () => {
    const world = createJobWorld();
    const posting = world.postFell(15, { wage: 4 });
    expect(payWage(world.engine, 99, posting)).toBe(false);
    const worker = world.spawn("peasant", 5, noAiOverride);
    const inventory = worker.components["Inventory"] as {
      slotCount: number;
      slots: { materialId: string }[];
    };
    inventory.slotCount = inventory.slots.length;
    expect(payWage(world.engine, worker.id, posting)).toBe(false);
    expect(world.engine.warnings.length).toBe(1);
  });
});
