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
import { merchantComponent } from "../trade/merchantComponent";
import { envoyComponent } from "../diplomacy/envoyComponent";
import { settlementChronicleComponent } from "../settlement/settlementChronicleComponent";
import { settlementProgressComponent } from "../settlement/settlementProgressComponent";
import { traderComponent } from "../trade/traderComponent";
import { animalComponent } from "../fauna/animalComponent";
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
    animalComponent,
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
    merchantComponent,
    traderComponent,
    envoyComponent,
    settlementProgressComponent,
    settlementChronicleComponent,
  ]) {
    registry.register(definition);
  }
  return registry;
}

function registerPackHandlers(handlers: BehaviorHandlerRegistry): void {
  for (const id of [
    "any_need_below_critical",
    "jobs_available",
    "household_needs_goods",
    "zone_available",
    "hostile_animal_near",
    "animal_hungry",
    "threat_near",
    "humanoid_near",
    "prey_near",
    "no_guard_near",
    "animal_aggressive",
    "hunt_urge",
    "outside_pen",
  ]) {
    handlers.registerCondition(id, () => NodeStatus.Failure);
  }
  for (const id of [
    "satisfy_critical_need",
    "idle_wander",
    "claim_job",
    "fetch_household_goods",
    "go_to_zone",
    "engage_threat",
    "flee_from_threat",
    "graze",
    "wander_animal",
    "stalk_prey",
    "attack_prey",
    "steal_prey",
    "attack_intruder",
    "return_to_pen",
  ]) {
    handlers.registerAction(id, () => NodeStatus.Success);
  }
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
    expect(first.ids()).toEqual(
      expect.arrayContaining([
        "baker",
        "build_site",
        "deer",
        "sheep",
        "carpenter",
        "chest",
        "diplomatic_envoy",
        "door",
        "faction",
        "farmer",
        "furniture_piece",
        "government_faction",
        "grinding_mill",
        "job_board",
        "loose_pile",
        "npc_leader",
        "oven",
        "peasant",
        "sawmill",
        "trader_caravan",
        "wall",
        "workbench",
        "zone",
      ]),
    );
    expect(first.ids()).toEqual(second.ids());
    expect(first.ids()).toEqual([...first.ids()].sort());
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
    registerPackHandlers(handlers);
    const trees = content.createBehaviorTreeRegistry(handlers);
    expect(trees.ids()).toEqual(
      expect.arrayContaining(["basic_needs", "idle_wander", "daily_routine", "worker_cycle"]),
    );
    expect(content.createBehaviorTreeRegistry(handlers)).not.toBe(trees);
  });
});
