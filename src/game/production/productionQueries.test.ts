import { describe, expect, it } from "vitest";
import { ProductionError, ProductionErrorKind } from "./ProductionError";
import {
  canMake,
  capableWorkstations,
  compatibleRecipes,
  findOrder,
  findWorkstation,
  isRecipeLocked,
  listWorkstations,
  requireOrder,
  requireWorkstation,
  stationTags,
} from "./productionQueries";
import { createProductionWorld } from "./testProductionWorld";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";

describe("workstation lookups", () => {
  it("lists the entities with a ProductionOrders component, ascending", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    world.chest(50);
    const oven = world.station("oven", 22);
    const mill = world.station("grinding_mill", 33);
    expect(listWorkstations(world.engine).map((station) => station.id)).toEqual([oven.id, mill.id]);
  });

  it("finds or requires a workstation by id", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    const chest = world.chest(50);
    const oven = world.station("oven", 22);
    expect(findWorkstation(world.engine, oven.id)?.station.id).toBe(oven.id);
    expect(findWorkstation(world.engine, chest.id)).toBeNull();
    expect(findWorkstation(world.engine, 9999)).toBeNull();
    expect(requireWorkstation(world.engine, oven.id).data.orders).toEqual([]);
    expect(() => requireWorkstation(world.engine, chest.id)).toThrow(ProductionError);
    expect(() => requireWorkstation(world.engine, 9999)).toThrowError(
      expect.objectContaining({ kind: ProductionErrorKind.UnknownEntity }),
    );
  });
});

describe("recipe compatibility", () => {
  it("matches the furniture tag against the recipe workstation tag", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    const oven = world.station("oven", 22);
    expect(stationTags(world.engine, oven)).toContain("oven");
    expect(stationTags(world.engine, world.chest(50))).toEqual(["storage"]);
    const bake = world.engine.content.recipes.require("bake_bread");
    const saw = world.engine.content.recipes.require("saw_oak_planks");
    expect(canMake(world.engine, oven, bake)).toBe(true);
    expect(canMake(world.engine, oven, saw)).toBe(false);
    expect(compatibleRecipes(world.engine, oven).map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["bake_bread"]),
    );
    expect(compatibleRecipes(world.engine, oven).map((recipe) => recipe.id)).not.toContain(
      "saw_oak_planks",
    );
  });

  it("lists the capable workstations of a recipe, none for an unknown recipe", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    const first = world.station("sawmill", 22);
    world.station("oven", 23);
    const second = world.station("sawmill", 24);
    expect(
      capableWorkstations(world.engine, "saw_oak_planks").map((station) => station.id),
    ).toEqual([first.id, second.id]);
    expect(capableWorkstations(world.engine, "nope")).toEqual([]);
  });

  it("locks a recipe until the settlement reaches its tier", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    const bake = world.engine.content.recipes.require("bake_bread");
    const saw = world.engine.content.recipes.require("saw_oak_planks");
    world.setTier("hamlet");
    expect(isRecipeLocked(world.engine, bake)).toBe(true);
    expect(isRecipeLocked(world.engine, saw)).toBe(false);
    world.setTier("village");
    expect(isRecipeLocked(world.engine, bake)).toBe(false);
  });
});

describe("order lookups", () => {
  it("finds an order over all workstations", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    const mill = world.station("grinding_mill", 22);
    const sawmill = world.station("sawmill", 23);
    world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 1 });
    const second = world.order({
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 2,
    });
    const found = findOrder(world.engine, second);
    expect(found?.station.id).toBe(sawmill.id);
    expect(found?.order.quantity).toBe(2);
    expect(findOrder(world.engine, 99)).toBeNull();
    expect(requireOrder(world.engine, second).order.orderId).toBe(second);
    expect(() => requireOrder(world.engine, 99)).toThrowError(
      expect.objectContaining({ kind: ProductionErrorKind.UnknownOrder }),
    );
  });
});
