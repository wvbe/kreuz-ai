import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { firstOutputMisfit } from "./firstOutputMisfit";
import { createProductionWorld } from "./testProductionWorld";

describe("firstOutputMisfit", () => {
  it("accepts outputs that fit and leaves the inventory untouched", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    expect(
      firstOutputMisfit(world.engine, sawmill, [], [{ materialId: "oak_plank", quantity: 4 }]),
    ).toBeNull();
    expect(getTotal(sawmill, "oak_plank")).toBe(0);
  });

  it("names the first output that does not fit", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    expect(
      firstOutputMisfit(world.engine, sawmill, [], [{ materialId: "oak_plank", quantity: 5000 }]),
    ).toBe("oak_plank");
  });

  it("lets the consumed inputs free their room first", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    const inventory = sawmill.components["Inventory"] as { slotCount: number };
    inventory.slotCount = 1;
    world.give(sawmill, "oak_log", 1);
    const outputs = [{ materialId: "oak_plank", quantity: 2 }];
    expect(firstOutputMisfit(world.engine, sawmill, [], outputs)).toBe("oak_plank");
    expect(
      firstOutputMisfit(world.engine, sawmill, [{ materialId: "oak_log", quantity: 1 }], outputs),
    ).toBeNull();
  });

  it("judges against the inventory as it is when the inputs are not there yet", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    expect(
      firstOutputMisfit(
        world.engine,
        sawmill,
        [{ materialId: "oak_log", quantity: 1 }],
        [{ materialId: "oak_plank", quantity: 2 }],
      ),
    ).toBeNull();
  });

  it("reports the first output when the entity has no inventory", () => {
    const world = createProductionWorld();
    const piece = world.furniture(22, "sawmill");
    expect(
      firstOutputMisfit(world.engine, piece, [], [{ materialId: "oak_plank", quantity: 2 }]),
    ).toBe("oak_plank");
    expect(firstOutputMisfit(world.engine, piece, [], [])).toBeNull();
  });
});
