import { describe, expect, it } from "vitest";
import { aiStateComponent } from "../../src/game/behavior/aiStateComponent";
import { BehaviorHandlerRegistry } from "../../src/game/behavior/BehaviorHandlerRegistry";
import { NodeStatus } from "../../src/game/behavior/behaviorTypes";
import { loadContent } from "../../src/game/content/ContentLoader";
import { ComponentRegistry } from "../../src/game/ecs/ComponentRegistry";
import { requireComponent } from "../../src/game/ecs/Entity";
import { EntityStore } from "../../src/game/ecs/EntityStore";
import { IdCounters } from "../../src/game/engine/IdCounters";
import { inventoryComponent } from "../../src/game/inventory/inventoryComponent";
import { getTotal } from "../../src/game/inventory/inventoryQueries";
import { positionComponent } from "../../src/game/map/positionComponent";
import { taskQueueComponent } from "../../src/game/task/taskQueueComponent";

// Pack v0 plugs into the kernel registries of one engine: components, prototypes, materials,
// terrain and behavior trees, and every humanoid prototype can be spawned.

function createHandlers(): BehaviorHandlerRegistry {
  const handlers = new BehaviorHandlerRegistry();
  handlers.registerCondition("any_need_below_critical", () => NodeStatus.Failure);
  handlers.registerAction("satisfy_critical_need", () => NodeStatus.Success);
  handlers.registerAction("idle_wander", () => NodeStatus.Success);
  return handlers;
}

describe("content pack v0 with the kernel", () => {
  it("spawns every humanoid prototype with valid components", () => {
    const content = loadContent({ handlers: createHandlers() });
    const components = new ComponentRegistry();
    for (const definition of [
      positionComponent,
      inventoryComponent,
      taskQueueComponent,
      aiStateComponent,
    ]) {
      components.register(definition);
    }
    const prototypes = content.createPrototypeRegistry(components);
    const store = new EntityStore({ components, prototypes, counters: new IdCounters() });

    const spawned = content.humanoids.all().map((humanoid) => store.spawn(humanoid.id));
    expect(spawned.map((entity) => entity.prototype)).toEqual([
      "peasant",
      "farmer",
      "carpenter",
      "baker",
    ]);
    const baker = spawned[3];
    if (!baker) throw new Error("baker missing");
    expect(getTotal(baker, "silver_penny")).toBe(20);
    expect(requireComponent(baker, aiStateComponent).treeId).toBe("basic_needs");
    expect(store.spawn("government_faction").components).toEqual({});
    expect(store.size).toBe(5);
  });

  it("builds the behavior trees of the pack against registered handlers", () => {
    const content = loadContent();
    const handlers = createHandlers();
    const trees = content.createBehaviorTreeRegistry(handlers);
    expect(trees.ids()).toEqual(["basic_needs", "idle_wander"]);
    expect(trees.require("basic_needs").root.type).toBe("selector");
  });

  it("gives each engine its own registries from the same pack", () => {
    const first = loadContent();
    const second = loadContent();
    const components = new ComponentRegistry();
    components.register(positionComponent);
    components.register(inventoryComponent);
    components.register(taskQueueComponent);
    components.register(aiStateComponent);
    const prototypesA = first.createPrototypeRegistry(components);
    const prototypesB = second.createPrototypeRegistry(components);
    expect(prototypesA).not.toBe(prototypesB);
    expect(prototypesA.instantiate("farmer")).toEqual(prototypesB.instantiate("farmer"));
    expect(first.terrain.ids()).toEqual(second.terrain.ids());
  });
});
