import { describe, expect, it } from "vitest";
import { createAiWorld } from "../../src/game/ai/testAiWorld";
import { measureTreeDepth } from "../../src/game/behavior/behaviorTreeSchema";
import type { BehaviorNode } from "../../src/game/behavior/behaviorTypes";
import { loadContent } from "../../src/game/content/ContentLoader";
import { AnimalKind } from "../../src/game/content/contentTypes";
import { findUnhandledJobTypes } from "../../src/game/jobs/jobCoverage";

// Spec 022 US11 (animals) and US14 (behavior trees): the pack's animal prototypes and trees.

const content = loadContent();

const livestock = ["sheep", "cow", "goat", "pig", "chicken", "horse", "donkey"];
const wild = ["deer", "rabbit", "boar", "wolf", "bear", "fox"];

function leaves(node: BehaviorNode): BehaviorNode[] {
  return node.type === "selector" || node.type === "sequence"
    ? node.children.flatMap((child) => leaves(child))
    : [node];
}

describe("animal prototypes (spec 022 US11)", () => {
  it("has the 7 livestock and 6 wild animals of the spec, each with a tree", () => {
    expect(content.animals.ids()).toEqual([...livestock, ...wild].sort());
    expect(content.animals.size).toBe(13);
    for (const animal of content.animals.all()) {
      expect(content.behaviorTrees.has(animal.behaviorTreeId)).toBe(true);
      expect(animal.kind).toBe(
        livestock.includes(animal.id) ? AnimalKind.Livestock : AnimalKind.Wild,
      );
    }
  });

  it("gives livestock the husbandry skill and periodic products where the spec has them", () => {
    const periodic = (id: string): string[] =>
      content.animals.require(id).products.map((product) => product.materialId);
    expect(periodic("sheep")).toEqual(["raw_wool"]);
    expect(periodic("cow")).toEqual(["milk"]);
    expect(periodic("goat")).toEqual(["milk"]);
    expect(periodic("chicken")).toEqual(["eggs"]);
    expect(periodic("pig")).toEqual([]);
    for (const id of livestock) {
      const animal = content.animals.require(id);
      expect(animal.tendingSkillId).toBe("animal_husbandry");
      expect(animal.productIntervalTicks > 0).toBe(animal.products.length > 0);
    }
  });

  it("gives the drops of the spec to the wild animals and the butcher drops to livestock", () => {
    const drops = (id: string): string[] =>
      content.animals.require(id).drops.map((drop) => drop.materialId);
    expect(drops("deer")).toEqual(["raw_meat", "raw_hide"]);
    expect(drops("rabbit")).toEqual(["raw_meat"]);
    expect(drops("boar")).toEqual(["raw_meat", "raw_hide", "tallow"]);
    expect(drops("wolf")).toEqual(["raw_hide"]);
    expect(drops("bear")).toEqual(["raw_meat", "raw_hide"]);
    expect(drops("fox")).toEqual(["raw_hide"]);
    expect(drops("cow")).toContain("raw_meat");
    expect(drops("goat")).toContain("raw_hide");
    expect(drops("pig")).toEqual(["raw_meat", "tallow"]);
    expect(drops("horse")).toEqual([]);
  });

  it("orders the threat levels as the spec does and makes only the dangerous ones predators", () => {
    const threat = (id: string): number => content.animals.require(id).threatLevel;
    expect(wild.map(threat)).toEqual([0, 0, 2, 3, 4, 1]);
    expect(content.animals.require("wolf").preyIds).toContain("sheep");
    expect(content.animals.require("fox").preyIds).toEqual(["chicken"]);
    expect(content.animals.require("bear").aggressive).toBe(true);
    for (const id of wild) {
      expect(content.animals.require(id).habitatTerrainIds.length).toBeGreaterThan(0);
    }
  });

  it("is an entity prototype of every engine without the citizen components", () => {
    const world = createAiWorld();
    for (const id of content.animals.ids()) {
      const entity = world.spawn(id, 0, { AiState: { treeId: null } });
      expect(entity.components["Animal"]?.["prototypeId"]).toBe(id);
      expect(entity.components["Citizen"]).toBeUndefined();
      expect(entity.components["Identity"]).toBeUndefined();
      expect(entity.components["Needs"]).toBeUndefined();
      expect(entity.components["Inventory"]).toBeDefined();
    }
  });
});

describe("behavior trees (spec 022 US14)", () => {
  const specTrees = [
    "daily_routine",
    "worker_cycle",
    "guard_patrol",
    "merchant_routine",
    "priest_routine",
    "livestock_behavior",
    "predator_behavior",
  ];

  it("has the 7 trees of the spec, the v0 trees and the animal trees of the cross-reference item 8", () => {
    expect(content.behaviorTrees.ids()).toEqual(
      expect.arrayContaining([
        ...specTrees,
        "basic_needs",
        "idle_wander",
        "prey_behavior",
        "fox_behavior",
      ]),
    );
    expect(content.behaviorTrees.size).toBe(11);
  });

  it("keeps every tree within the depth limit of five", () => {
    for (const tree of content.behaviorTrees.all()) {
      expect(measureTreeDepth(tree.root)).toBeLessThanOrEqual(5);
    }
  });

  it("references other trees by run_tree, never by copying them", () => {
    const referenced = (id: string): string[] =>
      leaves(content.behaviorTrees.require(id).root)
        .filter((node) => node.type === "action" && node.id === "run_tree")
        .map((node) => String((node as { params?: { treeId?: string } }).params?.treeId));
    expect(referenced("daily_routine")).toEqual(["worker_cycle", "idle_wander"]);
    expect(referenced("guard_patrol")).toEqual(["daily_routine"]);
    expect(referenced("merchant_routine")).toEqual(["daily_routine"]);
    expect(referenced("priest_routine")).toEqual(["daily_routine"]);
  });

  it("assigns the role trees to the new humanoids and keeps basic_needs on the v0 four", () => {
    const tree = (id: string): string => content.humanoids.require(id).behaviorTreeId;
    for (const id of ["peasant", "farmer", "carpenter", "baker"]) {
      expect(tree(id)).toBe("basic_needs");
    }
    expect(tree("guard")).toBe("guard_patrol");
    expect(tree("soldier")).toBe("guard_patrol");
    expect(tree("merchant")).toBe("merchant_routine");
    expect(tree("priest")).toBe("priest_routine");
    expect(tree("monk")).toBe("priest_routine");
    expect(tree("mason")).toBe("daily_routine");
  });

  it("registers every handler the trees name with an engine (checked at load)", () => {
    expect(() => createAiWorld()).not.toThrow();
  });
});

describe("animal jobs", () => {
  it("has executors for tend.animals, hunt.game and butcher.animal", () => {
    const world = createAiWorld();
    for (const id of ["tend.animals", "hunt.game", "butcher.animal"]) {
      expect(content.jobs.has(id)).toBe(true);
      expect(world.engine.taskHandlers.has(id)).toBe(true);
    }
    expect(findUnhandledJobTypes(world.engine)).toEqual([]);
  });
});
