import { describe, expect, it } from "vitest";
import { contentWithRecipes, createProductionWorld } from "./testProductionWorld";

describe("createProductionWorld", () => {
  it("builds a world with every tier unlocked, workstations, settlers and a recording of events", () => {
    const world = createProductionWorld();
    const sawmill = world.station("sawmill", 22);
    const settler = world.settler(11);
    expect(sawmill.prototype).toBe("sawmill");
    expect(settler.prototype).toBe("peasant");
    expect(world.data(sawmill)).toEqual({ orders: [], craft: null });
    const id = world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    expect(id).toBe(1);
    world.engine.bus.processQueue();
    expect(world.seen.map((event) => event.name)).toEqual(["production.order.created"]);
    expect(() => world.data(settler)).toThrow();
  });

  it("feed tops up the needs of citizens", () => {
    const world = createProductionWorld();
    const settler = world.settler(11);
    world.feed([settler]);
    const needs = settler.components["Needs"] as { values: { valueMilli: number }[] };
    expect(needs.values.every((entry) => entry.valueMilli === 80_000)).toBe(true);
  });
});

describe("contentWithRecipes", () => {
  it("adds recipe records to the bundled pack", () => {
    const content = contentWithRecipes([
      {
        id: "plank_twice",
        name: "Plank twice",
        inputs: [{ materialId: "oak_log", quantity: 1 }],
        outputs: [{ materialId: "oak_plank", quantity: 4 }],
        durationTicks: 5,
        workstationTag: "sawmill",
        skillId: "carpentry",
      },
    ]);
    expect(content.recipes.has("plank_twice")).toBe(true);
    expect(content.recipes.has("saw_oak_planks")).toBe(true);
    expect(content.recipes.require("plank_twice").minSkillLevel).toBe(0);
  });
});
