import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { contentWithRecipes, createProductionWorld } from "./testProductionWorld";

const byproductRecipe = {
  id: "bake_with_chaff",
  name: "Bake with chaff",
  inputs: [{ materialId: "flour", quantity: 1 }],
  outputs: [
    { materialId: "bread", quantity: 2 },
    { materialId: "wheat", quantity: 1 },
  ],
  durationTicks: 8,
  workstationTag: "oven",
  skillId: "baking",
};

// @covers 014:FR-019 014:FR-004
describe("production audit 014", () => {
  it("places every output of a recipe, byproducts included, in the work inventory", () => {
    const world = createProductionWorld({ content: contentWithRecipes([byproductRecipe]) });
    world.give(world.chest(55), "flour", 2);
    const oven = world.station("oven", 44);
    world.feed([world.settler(11)]);
    world.order({ workstationId: oven.id, recipeId: "bake_with_chaff", quantity: 2 });
    for (let tick = 0; tick < 300; tick += 1) {
      world.run(1);
    }
    const completed = world.seen.filter((event) => event.name === "production.crafting.completed");
    expect(completed).toHaveLength(2);
    expect(completed[0]?.payload).toMatchObject({
      outputs: [
        { materialId: "bread", quantity: 2 },
        { materialId: "wheat", quantity: 1 },
      ],
    });
    const stored = ["bread", "wheat"].map((id) =>
      world.engine.store
        .entities()
        .filter((entity) => entity.components["Inventory"] !== undefined)
        .reduce((sum, entity) => sum + getTotal(entity, id), 0),
    );
    expect(stored[0]).toBeGreaterThanOrEqual(4);
    expect(stored[1]).toBe(2);
  });

  it("rejects a recipe that names an unknown material at load, naming the recipe", () => {
    expect(() =>
      contentWithRecipes([
        {
          ...byproductRecipe,
          id: "bad_recipe",
          outputs: [{ materialId: "nothing_such", quantity: 1 }],
        },
      ]),
    ).toThrow(/nothing_such|bad_recipe/);
  });
});

// @covers 014:SC-003 014:SC-009 014:FR-012
describe("concurrent crafting at many workstations", () => {
  it("runs one craft per workstation at the same time and completes them all", () => {
    const world = createProductionWorld();
    const stations = Array.from({ length: 12 }, (_, index) =>
      world.station("sawmill", (1 + (index % 8)) * 10 + 5 + (index >= 8 ? 1 : 0)),
    );
    world.give(world.chest(99), "oak_log", 40);
    world.feed(
      stations.map((_, index) => world.settler((1 + (index % 8)) * 10 + 2 + (index >= 8 ? 1 : 0))),
    );
    for (const station of stations) {
      world.order({ workstationId: station.id, recipeId: "saw_oak_planks", quantity: 1 });
    }
    let peak = 0;
    for (let tick = 0; tick < 400; tick += 1) {
      world.run(1);
      const crafting = stations.filter((station) => world.data(station).craft !== null).length;
      peak = Math.max(peak, crafting);
    }
    expect(peak).toBeGreaterThan(1);
    expect(
      world.seen.filter((event) => event.name === "production.crafting.completed"),
    ).toHaveLength(12);
  });
});
