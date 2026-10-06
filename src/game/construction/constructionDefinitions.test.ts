import { describe, expect, it } from "vitest";
import {
  builtPrototype,
  deconstructionTicks,
  findBuildDefinition,
  isUnlocked,
  requiredMaterials,
  unlockText,
  unlockTierOf,
} from "./constructionDefinitions";
import { createConstructionWorld } from "./testConstructionWorld";
import { getJobService } from "../jobs/jobServiceRegistry";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";

function setup() {
  const world = createConstructionWorld({ content: loadVillageBakeryContent() });
  const definition = (id: string) => {
    const found = findBuildDefinition(world.engine, id);
    if (found === undefined) {
      throw new Error(`no definition ${id}`);
    }
    return found;
  };
  return { world, definition };
}

describe("findBuildDefinition", () => {
  it("finds furniture, walls and doors and nothing else", () => {
    const { world } = setup();
    for (const id of ["wooden_bed", "oven", "chest", "table", "workbench", "wall", "door"]) {
      expect(findBuildDefinition(world.engine, id)?.id).toBe(id);
    }
    expect(findBuildDefinition(world.engine, "castle")).toBeUndefined();
  });
});

describe("requiredMaterials", () => {
  it("returns copies of the material list", () => {
    const { definition } = setup();
    const first = requiredMaterials(definition("wall"));
    expect(first).toEqual([{ materialId: "stone_block", quantity: 1 }]);
    first[0] = { materialId: "x", quantity: 9 };
    expect(requiredMaterials(definition("wall"))).toEqual([
      { materialId: "stone_block", quantity: 1 },
    ]);
  });
});

describe("deconstructionTicks", () => {
  it("is half the construction ticks and at least one", () => {
    const { definition } = setup();
    expect(deconstructionTicks(definition("oven"))).toBe(24);
    expect(deconstructionTicks({ ...definition("wall"), constructionTicks: 1 })).toBe(1);
  });
});

describe("unlockTierOf and isUnlocked", () => {
  it("uses hamlet without an unlock tier and compares against the tier in force", () => {
    const { world, definition } = setup();
    expect(unlockTierOf({ ...definition("wall"), unlockTier: undefined })).toBe("hamlet");
    expect(unlockTierOf(definition("oven"))).toBe("village");
    getJobService(world.engine).setTierSource(() => "hamlet");
    expect(isUnlocked(world.engine, definition("chest"))).toBe(true);
    expect(isUnlocked(world.engine, definition("oven"))).toBe(false);
    getJobService(world.engine).setTierSource(() => "village");
    expect(isUnlocked(world.engine, definition("oven"))).toBe(true);
  });

  it("covers every v0 furniture, wall and door, with the starter pieces at hamlet", () => {
    const { world } = setup();
    for (const definition of world.engine.content.furniture.all()) {
      expect(definition.constructionMaterials.length).toBeGreaterThan(0);
      expect(definition.constructionTicks).toBeGreaterThan(0);
      expect(definition.deconstructionYield.length).toBeGreaterThan(0);
    }
    for (const id of ["chest", "table", "wooden_bed", "workbench", "wall", "door"]) {
      expect(unlockTierOf(world.engine.content.furniture.require(id))).toBe("hamlet");
    }
  });
});

describe("unlockText", () => {
  it("reads Unlocks at <Tier> in title case", () => {
    expect(unlockText("village")).toBe("Unlocks at Village");
    expect(unlockText("market_town")).toBe("Unlocks at Market Town");
  });
});

describe("builtPrototype", () => {
  it("uses the engine prototype of the id, else the furniture placeholder", () => {
    const { world } = setup();
    expect(builtPrototype(world.engine, "oven")).toEqual({ prototypeId: "oven", overrides: {} });
    expect(builtPrototype(world.engine, "wall")).toEqual({ prototypeId: "wall", overrides: {} });
    expect(builtPrototype(world.engine, "table")).toEqual({
      prototypeId: "furniture_piece",
      overrides: { Furniture: { furnitureId: "table" } },
    });
  });
});
