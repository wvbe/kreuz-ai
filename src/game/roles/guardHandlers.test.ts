import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import type { AiTestWorld } from "../ai/testAiWorld";
import { healthComponent } from "../ai/needs/healthComponent";
import { NodeStatus } from "../behavior/behaviorTypes";
import type { BehaviorContext } from "../behavior/behaviorTypes";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { noAiOverride } from "../jobs/testJobWorld";
import { taskQueueComponent } from "../task/taskQueueComponent";
import {
  engagePriority,
  engageThreat,
  guardStrikeMilli,
  hostileAnimalNear,
  registerGuardHandlers,
} from "./guardHandlers";

function contextOf(world: AiTestWorld, entity: Entity): BehaviorContext {
  return {
    entityId: entity.id,
    entity,
    tick: 100,
    params: {},
    store: world.engine.store,
    bus: world.engine.bus,
  };
}

describe("guard handlers", () => {
  it("hostile_animal_near sees predators and nothing else", () => {
    const world = createAiWorld();
    const guard = world.spawn("guard", 0, noAiOverride);
    world.spawn("deer", 1, noAiOverride);
    expect(hostileAnimalNear(world.engine, contextOf(world, guard))).toBe(NodeStatus.Failure);
    world.spawn("wolf", 4, noAiOverride);
    expect(hostileAnimalNear(world.engine, contextOf(world, guard))).toBe(NodeStatus.Success);
  });

  it("hostile_animal_near ignores predators beyond the detection range", () => {
    const world = createAiWorld();
    const guard = world.spawn("guard", 0, noAiOverride);
    world.spawn("wolf", 99, noAiOverride);
    expect(hostileAnimalNear(world.engine, contextOf(world, guard))).toBe(NodeStatus.Failure);
  });

  it("engage_threat walks to a predator that is out of reach", () => {
    const world = createAiWorld();
    const guard = world.spawn("guard", 0, noAiOverride);
    expect(engageThreat(world.engine, contextOf(world, guard))).toBe(NodeStatus.Failure);
    world.spawn("wolf", 5, noAiOverride);
    expect(engageThreat(world.engine, contextOf(world, guard))).toBe(NodeStatus.Success);
    const tasks = getComponent(guard, taskQueueComponent)?.tasks ?? [];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.priority).toBe(engagePriority);
  });

  it("engage_threat strikes a predator in reach until it is driven off", () => {
    const world = createAiWorld();
    const guard = world.spawn("guard", 0, noAiOverride);
    const wolf = world.spawn("wolf", 1, noAiOverride);
    engageThreat(world.engine, contextOf(world, guard));
    expect(getComponent(wolf, healthComponent)?.valueMilli).toBe(100_000 - guardStrikeMilli);
    engageThreat(world.engine, contextOf(world, guard));
    engageThreat(world.engine, contextOf(world, guard));
    expect(world.engine.store.isPendingDelete(wolf.id)).toBe(true);
    expect(engageThreat(world.engine, contextOf(world, guard))).toBe(NodeStatus.Failure);
  });

  it("is registered by the engine already (a second registration is a duplicate)", () => {
    const world = createAiWorld();
    expect(() => registerGuardHandlers(world.engine)).toThrow();
  });
});
