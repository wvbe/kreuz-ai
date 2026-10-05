import { describe, expect, it } from "vitest";
import { BehaviorHandlerRegistry } from "../behavior/BehaviorHandlerRegistry";
import { NodeStatus } from "../behavior/behaviorTypes";
import { aiStateComponent } from "../behavior/aiStateComponent";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { positionComponent } from "../map/positionComponent";
import { skillsComponent, traitsComponent } from "../skills/skillsComponent";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { governmentFactionPrototypeId } from "./ContentRegistries";
import { loadContent } from "./ContentLoader";

function components(): ComponentRegistry {
  const registry = new ComponentRegistry();
  registry.register(positionComponent);
  registry.register(inventoryComponent);
  registry.register(taskQueueComponent);
  registry.register(aiStateComponent);
  registry.register(skillsComponent);
  registry.register(traitsComponent);
  return registry;
}

describe("ContentRegistries", () => {
  it("fills the inventory and map registries", () => {
    const content = loadContent();
    expect(content.materials.require("oak_plank").stackLimit).toBe(40);
    expect(content.terrain.require("water_shallow").passable).toBe(false);
    expect(content.terrainContent.require("forest_oak").clearsTo).toBe("grassland");
  });

  it("creates an independent prototype registry per call", () => {
    const content = loadContent();
    const first = content.createPrototypeRegistry(components());
    const second = content.createPrototypeRegistry(components());
    expect(first).not.toBe(second);
    expect(first.ids()).toEqual([
      "baker",
      "carpenter",
      "farmer",
      "government_faction",
      "job_board",
      "peasant",
      "wall",
    ]);
    expect(first.has(governmentFactionPrototypeId)).toBe(true);
  });

  it("registerPrototypes fills an existing registry", () => {
    const content = loadContent();
    const target = new PrototypeRegistry(components());
    content.registerPrototypes(target);
    expect(target.ids()).toEqual(content.createPrototypeRegistry(components()).ids());
    expect(() => content.registerPrototypes(target)).toThrow();
  });

  it("creates a behavior tree registry once the handlers exist", () => {
    const content = loadContent();
    const handlers = new BehaviorHandlerRegistry();
    expect(() => content.createBehaviorTreeRegistry(handlers)).toThrow();
    handlers.registerCondition("any_need_below_critical", () => NodeStatus.Failure);
    handlers.registerAction("satisfy_critical_need", () => NodeStatus.Success);
    handlers.registerAction("idle_wander", () => NodeStatus.Success);
    const trees = content.createBehaviorTreeRegistry(handlers);
    expect(trees.ids()).toEqual(["basic_needs", "idle_wander"]);
    expect(content.createBehaviorTreeRegistry(handlers)).not.toBe(trees);
  });
});
