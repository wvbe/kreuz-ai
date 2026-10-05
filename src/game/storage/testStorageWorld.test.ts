import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { createStorageWorld } from "./testStorageWorld";

describe("createStorageWorld", () => {
  it("spawns chests, piles and gives items", () => {
    const world = createStorageWorld();
    const chest = world.chest(5);
    const pile = world.pile(6, [{ materialId: "oak_log", quantity: 7 }]);
    world.give(chest, "bread", 3);
    expect(chest.prototype).toBe("chest");
    expect(pile.prototype).toBe("loose_pile");
    expect(getTotal(pile, "oak_log")).toBe(7);
    expect(getTotal(chest, "bread")).toBe(3);
    expect(world.count("oak_log")).toBe(7);
    expect(world.count("bread")).toBe(3);
  });

  it("applies component overrides to the chest", () => {
    const world = createStorageWorld();
    const chest = world.chest(5, { Stockpile: { priority: 80, filter: null } });
    expect(chest.components["Stockpile"]).toEqual({ priority: 80, filter: null });
  });
});
