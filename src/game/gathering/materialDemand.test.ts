import { describe, expect, it } from "vitest";
import { materialDemanded, ordersNeed } from "./materialDemand";
import { contentWithConstants, createGatheringWorld } from "./testGatheringWorld";

function sawOrder(world: ReturnType<typeof createGatheringWorld>, quantity: number): void {
  const sawmill = world.spawn("sawmill", 44);
  world.command("CreateProductionOrder", {
    workstationId: sawmill.id,
    recipeId: "saw_oak_planks",
    quantity,
  });
}

describe("ordersNeed", () => {
  it("is zero without production orders", () => {
    expect(ordersNeed(createGatheringWorld().engine, "oak_log")).toBe(0);
  });

  it("adds the recipe inputs of the crafts still to do", () => {
    const world = createGatheringWorld();
    const perCraft =
      world.engine.content.recipes
        .require("saw_oak_planks")
        .inputs.find((input) => input.materialId === "oak_log")?.quantity ?? 0;
    sawOrder(world, 3);
    expect(perCraft).toBeGreaterThan(0);
    expect(ordersNeed(world.engine, "oak_log")).toBe(perCraft * 3);
    expect(ordersNeed(world.engine, "clay")).toBe(0);
  });
});

describe("materialDemanded", () => {
  it("is false for a material nobody asks for (rawLowStock is 0)", () => {
    const world = createGatheringWorld();
    expect(materialDemanded(world.engine, "clay")).toBe(false);
    expect(materialDemanded(world.engine, "oak_log")).toBe(false);
  });

  it("is true while a production order needs more than is in stock", () => {
    const world = createGatheringWorld();
    sawOrder(world, 2);
    expect(materialDemanded(world.engine, "oak_log")).toBe(true);
    world.give(world.chest(8), "oak_log", ordersNeed(world.engine, "oak_log"));
    expect(materialDemanded(world.engine, "oak_log")).toBe(false);
  });

  it("is true while stock is below the rawLowStock constant", () => {
    const world = createGatheringWorld({ content: contentWithConstants({ rawLowStock: 4 }) });
    expect(materialDemanded(world.engine, "clay")).toBe(true);
    world.give(world.chest(8), "clay", 4);
    expect(materialDemanded(world.engine, "clay")).toBe(false);
  });
});
