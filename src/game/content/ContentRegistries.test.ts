import { describe, expect, it } from "vitest";
import { BehaviorHandlerRegistry } from "../behavior/BehaviorHandlerRegistry";
import { NodeStatus } from "../behavior/behaviorTypes";
import { aiStateComponent } from "../behavior/aiStateComponent";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import { citizenComponent } from "../factions/citizenComponent";
import { jobBoardComponent } from "../jobs/jobBoardComponent";
import { factionComponent } from "../factions/factionComponent";
import { identityComponent } from "../identity/identityComponent";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { positionComponent } from "../map/positionComponent";
import { skillsComponent, traitsComponent } from "../skills/skillsComponent";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { governmentFactionPrototypeId } from "./ContentRegistries";
import { healthComponent } from "../ai/needs/healthComponent";
import { moodComponent } from "../ai/mood/moodComponent";
import { needsComponent } from "../ai/needs/needsComponent";
import { relationshipsComponent } from "../ai/relationships/relationshipsComponent";
import { furnitureComponent } from "../storage/furnitureComponent";
import { buildSiteComponent } from "../construction/buildSiteComponent";
import { stockpileComponent } from "../storage/stockpileComponent";
import { productionOrdersComponent } from "../production/productionOrdersComponent";
import { zoneComponent } from "../zones/zoneComponent";
import { loadContent } from "./ContentLoader";

function components(): ComponentRegistry {
  const registry = new ComponentRegistry();
  registry.register(positionComponent);
  registry.register(inventoryComponent);
  registry.register(taskQueueComponent);
  registry.register(aiStateComponent);
  registry.register(skillsComponent);
  registry.register(traitsComponent);
  registry.register(factionComponent);
  registry.register(citizenComponent);
  for (const definition of [
    identityComponent,
    needsComponent,
    moodComponent,
    healthComponent,
    relationshipsComponent,
    jobBoardComponent,
    furnitureComponent,
    stockpileComponent,
    zoneComponent,
    productionOrdersComponent,
    buildSiteComponent,
  ]) {
    registry.register(definition);
  }
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
      "build_site",
      "carpenter",
      "chest",
      "door",
      "faction",
      "farmer",
      "furniture_piece",
      "government_faction",
      "grinding_mill",
      "job_board",
      "loose_pile",
      "oven",
      "peasant",
      "sawmill",
      "wall",
      "workbench",
      "zone",
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
    handlers.registerCondition("jobs_available", () => NodeStatus.Failure);
    handlers.registerAction("claim_job", () => NodeStatus.Failure);
    const trees = content.createBehaviorTreeRegistry(handlers);
    expect(trees.ids()).toEqual(["basic_needs", "idle_wander"]);
    expect(content.createBehaviorTreeRegistry(handlers)).not.toBe(trees);
  });
});
