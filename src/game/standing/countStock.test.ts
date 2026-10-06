import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { TaskStatus } from "../task/taskTypes";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { countStock } from "./countStock";
import { StandingOrderScope } from "./standingTypes";
import type { StandingOrder } from "./standingTypes";
import { createStandingWorld } from "./testStandingWorld";

function order(overrides: Partial<StandingOrder> = {}): StandingOrder {
  return {
    orderId: 1,
    materialId: "bread",
    recipeId: "bake_bread",
    targetQuantity: 20,
    restockThreshold: 15,
    scope: StandingOrderScope.Settlement,
    zoneId: null,
    priority: 50,
    postingBoardId: null,
    paused: false,
    restocking: false,
    outputPerRun: 2,
    deleted: false,
    createdTick: 0,
    ...overrides,
  };
}

describe("countStock", () => {
  it("sums the storage furniture of the settlement and ignores loose piles", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.give(world.chest(30), "bread", 5);
    world.give(world.chest(55), "bread", 3);
    world.pile(60, [{ materialId: "bread", quantity: 9 }]);
    expect(countStock(world.engine, order())).toBe(8);
    expect(countStock(world.engine, order({ materialId: "flour" }))).toBe(0);
  });

  it("counts unreserved units in workstation inventories, not locked inputs (settlement only)", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const oven = world.spawn("oven", 30);
    world.give(oven, "bread", 4);
    expect(countStock(world.engine, order())).toBe(4);
    getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Lock,
      holderId: oven.id,
      inventoryOwnerId: oven.id,
      materialId: "bread",
      quantity: 3,
    });
    expect(countStock(world.engine, order())).toBe(1);
  });

  it("counts what a courier running haul.deliver carries", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const courier = world.settler(40);
    world.give(courier, "bread", 6);
    expect(countStock(world.engine, order())).toBe(0);
    world.engine.tasks.enqueue(courier.id, { type: "haul.deliver", data: {}, priority: 50 });
    const queue = world.engine.tasks.getQueue(courier.id);
    const task = queue?.tasks.find((entry) => entry.type === "haul.deliver");
    if (task === undefined) {
      throw new Error("no task");
    }
    task.status = TaskStatus.Running;
    expect(getTotal(courier, "bread")).toBeGreaterThanOrEqual(6);
    expect(countStock(world.engine, order())).toBe(getTotal(courier, "bread"));
  });

  it("counts only the furniture on the tiles of a zone for a zone scope", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const zoneId = world.zone("stockpile", [30, 31, 50, 51]);
    world.give(world.chest(30), "bread", 4);
    world.give(world.chest(100), "bread", 7);
    const oven = world.spawn("oven", 31);
    world.give(oven, "bread", 2);
    const zoned = order({ scope: StandingOrderScope.Zone, zoneId });
    expect(countStock(world.engine, zoned)).toBe(4);
    expect(countStock(world.engine, order())).toBe(13);
  });

  it("counts 0 for a zone scope whose zone is gone", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.give(world.chest(30), "bread", 4);
    expect(countStock(world.engine, order({ scope: StandingOrderScope.Zone, zoneId: 999 }))).toBe(
      0,
    );
  });
});
