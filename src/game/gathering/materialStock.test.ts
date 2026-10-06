import { describe, expect, it } from "vitest";
import { noAiOverride } from "../jobs/testJobWorld";
import { materialStock } from "./materialStock";
import { createGatheringWorld } from "./testGatheringWorld";

describe("materialStock", () => {
  it("adds the units of every inventory: carried, piled and stored", () => {
    const world = createGatheringWorld();
    expect(materialStock(world.engine, "iron_ore")).toBe(0);
    world.give(world.spawn("peasant", 5, noAiOverride), "iron_ore", 3);
    world.give(world.chest(6), "iron_ore", 4);
    world.pile(7, [{ materialId: "iron_ore", quantity: 2 }]);
    world.give(world.chest(8), "limestone", 9);
    expect(materialStock(world.engine, "iron_ore")).toBe(9);
    expect(materialStock(world.engine, "limestone")).toBe(9);
  });

  it("does not count what a travelling trader holds (it left the economy)", () => {
    const world = createGatheringWorld();
    world.give(world.spawn("trader_caravan", 4), "iron_ore", 5);
    world.give(world.chest(6), "iron_ore", 1);
    expect(materialStock(world.engine, "iron_ore")).toBe(1);
  });
});
