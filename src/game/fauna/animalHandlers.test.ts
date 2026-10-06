import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import type { AiTestWorld } from "../ai/testAiWorld";
import { healthComponent } from "../ai/needs/healthComponent";
import { NodeStatus } from "../behavior/behaviorTypes";
import type { BehaviorContext, BehaviorParams } from "../behavior/behaviorTypes";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { noAiOverride } from "../jobs/testJobWorld";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { animalComponent } from "./animalComponent";
import {
  animalAggressive,
  animalHungry,
  attackIntruder,
  attackPrey,
  fleeFromThreat,
  graze,
  humanoidNear,
  huntUrge,
  noGuardNear,
  preyNear,
  registerAnimalHandlers,
  stalkPrey,
  stealPrey,
  threatNear,
  wanderAnimalAction,
} from "./animalHandlers";
import {
  animalHungryMilli,
  attackDamageMilli,
  attackCooldownTicks,
  humanoidAttackDamageMilli,
} from "./faunaTypes";

function contextOf(
  world: AiTestWorld,
  entity: Entity,
  params: BehaviorParams = {},
  tick = 100,
): BehaviorContext {
  return {
    entityId: entity.id,
    entity,
    tick,
    params,
    store: world.engine.store,
    bus: world.engine.bus,
  };
}

function queueLength(entity: Entity): number {
  return getComponent(entity, taskQueueComponent)?.tasks.length ?? 0;
}

describe("animal handlers", () => {
  it("animal_hungry follows the hunger threshold", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 0, noAiOverride);
    expect(animalHungry(contextOf(world, sheep))).toBe(NodeStatus.Failure);
    const animal = getComponent(sheep, animalComponent);
    if (animal !== undefined) {
      animal.hungerMilli = animalHungryMilli;
    }
    expect(animalHungry(contextOf(world, sheep))).toBe(NodeStatus.Success);
  });

  it("threat_near looks for humanoids by default and for predators on request", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 0, noAiOverride);
    const sheep = world.spawn("sheep", 40, noAiOverride);
    world.spawn("peasant", 3, noAiOverride);
    expect(threatNear(world.engine, contextOf(world, deer))).toBe(NodeStatus.Success);
    expect(threatNear(world.engine, contextOf(world, sheep, { from: "predator" }))).toBe(
      NodeStatus.Failure,
    );
    world.spawn("wolf", 42, noAiOverride);
    expect(threatNear(world.engine, contextOf(world, sheep, { from: "predator" }))).toBe(
      NodeStatus.Success,
    );
  });

  it("threat_near fails for an animal that never flees", () => {
    const world = createAiWorld();
    const bear = world.spawn("bear", 0, noAiOverride);
    world.spawn("peasant", 1, noAiOverride);
    expect(threatNear(world.engine, contextOf(world, bear))).toBe(NodeStatus.Failure);
  });

  it("humanoid_near uses the detection radius", () => {
    const world = createAiWorld();
    const bear = world.spawn("bear", 0, noAiOverride);
    expect(humanoidNear(world.engine, contextOf(world, bear))).toBe(NodeStatus.Failure);
    world.spawn("peasant", 4, noAiOverride);
    expect(humanoidNear(world.engine, contextOf(world, bear))).toBe(NodeStatus.Success);
  });

  it("prey_near, no_guard_near and animal_aggressive read the record", () => {
    const world = createAiWorld();
    const wolf = world.spawn("wolf", 0, noAiOverride);
    const bear = world.spawn("bear", 90, noAiOverride);
    expect(preyNear(world.engine, contextOf(world, wolf))).toBe(NodeStatus.Failure);
    world.spawn("sheep", 3, noAiOverride);
    expect(preyNear(world.engine, contextOf(world, wolf))).toBe(NodeStatus.Success);
    expect(noGuardNear(world.engine, contextOf(world, wolf))).toBe(NodeStatus.Success);
    world.spawn("guard", 5, noAiOverride);
    expect(noGuardNear(world.engine, contextOf(world, wolf))).toBe(NodeStatus.Failure);
    expect(animalAggressive(world.engine, contextOf(world, bear))).toBe(NodeStatus.Success);
    expect(animalAggressive(world.engine, contextOf(world, wolf))).toBe(NodeStatus.Failure);
  });

  it("hunt_urge is a seeded roll", () => {
    const first = createAiWorld({ seed: 5 });
    const second = createAiWorld({ seed: 5 });
    const rolls = (world: AiTestWorld): NodeStatus[] =>
      Array.from({ length: 40 }, () => huntUrge(world.engine));
    const one = rolls(first);
    expect(one).toEqual(rolls(second));
    expect(one).toContain(NodeStatus.Success);
    expect(one).toContain(NodeStatus.Failure);
  });

  it("flee_from_threat runs away from the nearest threat, and fails without one", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 55, noAiOverride);
    expect(fleeFromThreat(world.engine, contextOf(world, deer))).toBe(NodeStatus.Failure);
    world.spawn("peasant", 54, noAiOverride);
    expect(fleeFromThreat(world.engine, contextOf(world, deer))).toBe(NodeStatus.Success);
    expect(queueLength(deer)).toBe(2);
  });

  it("graze and wander_animal enqueue tasks", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 55, noAiOverride);
    expect(graze(world.engine, contextOf(world, sheep))).toBe(NodeStatus.Success);
    expect(queueLength(sheep)).toBe(1);
    const rabbit = world.spawn("rabbit", 12, noAiOverride);
    expect(wanderAnimalAction(world.engine, contextOf(world, rabbit))).toBe(NodeStatus.Success);
    expect(queueLength(rabbit)).toBe(1);
  });

  it("stalk_prey walks towards prey that is out of reach and waits when it is in reach", () => {
    const world = createAiWorld();
    const wolf = world.spawn("wolf", 0, noAiOverride);
    expect(stalkPrey(world.engine, contextOf(world, wolf))).toBe(NodeStatus.Failure);
    world.spawn("sheep", 5, noAiOverride);
    expect(stalkPrey(world.engine, contextOf(world, wolf))).toBe(NodeStatus.Success);
    expect(queueLength(wolf)).toBe(1);
    expect(stalkPrey(world.engine, contextOf(world, wolf))).toBe(NodeStatus.Success);
    expect(queueLength(wolf)).toBe(1);
    const other = world.spawn("wolf", 90, noAiOverride);
    world.spawn("cow", 91, noAiOverride);
    expect(stalkPrey(world.engine, contextOf(world, other))).toBe(NodeStatus.Success);
    expect(queueLength(other)).toBe(0);
  });

  it("attack_prey hurts prey in reach once per cooldown and removes it at zero health", () => {
    const world = createAiWorld();
    const wolf = world.spawn("wolf", 0, noAiOverride);
    const sheep = world.spawn("sheep", 1, noAiOverride);
    expect(attackPrey(world.engine, contextOf(world, wolf, {}, 100))).toBe(NodeStatus.Success);
    expect(getComponent(sheep, healthComponent)?.valueMilli).toBe(100_000 - attackDamageMilli);
    attackPrey(world.engine, contextOf(world, wolf, {}, 101));
    expect(getComponent(sheep, healthComponent)?.valueMilli).toBe(100_000 - attackDamageMilli);
    let tick = 100;
    for (let hit = 0; hit < 3; hit += 1) {
      tick += attackCooldownTicks;
      attackPrey(world.engine, contextOf(world, wolf, {}, tick));
    }
    expect(world.engine.store.isPendingDelete(sheep.id)).toBe(true);
    expect(attackPrey(world.engine, contextOf(world, wolf, {}, tick + 99))).toBe(
      NodeStatus.Failure,
    );
  });

  it("attack_prey does not reach prey that is farther away", () => {
    const world = createAiWorld();
    const wolf = world.spawn("wolf", 0, noAiOverride);
    const sheep = world.spawn("sheep", 5, noAiOverride);
    attackPrey(world.engine, contextOf(world, wolf));
    expect(getComponent(sheep, healthComponent)?.valueMilli).toBe(100_000);
  });

  it("steal_prey removes the chicken of a fox within reach", () => {
    const world = createAiWorld();
    const fox = world.spawn("fox", 0, noAiOverride);
    const chicken = world.spawn("chicken", 6, noAiOverride);
    expect(stealPrey(world.engine, contextOf(world, fox))).toBe(NodeStatus.Success);
    expect(world.engine.store.isPendingDelete(chicken.id)).toBe(false);
    world.engine.maps.moveEntity(chicken.id, 1);
    (chicken.components["Position"] as { cellIndex: number }).cellIndex = 1;
    expect(stealPrey(world.engine, contextOf(world, fox))).toBe(NodeStatus.Success);
    expect(world.engine.store.isPendingDelete(chicken.id)).toBe(true);
    expect(stealPrey(world.engine, contextOf(world, fox))).toBe(NodeStatus.Failure);
  });

  it("attack_intruder hurts a humanoid in reach but never below the floor", () => {
    const world = createAiWorld();
    const bear = world.spawn("bear", 0, noAiOverride);
    expect(attackIntruder(world.engine, contextOf(world, bear))).toBe(NodeStatus.Failure);
    const peasant = world.spawn("peasant", 1, noAiOverride);
    expect(attackIntruder(world.engine, contextOf(world, bear, {}, 100))).toBe(NodeStatus.Success);
    expect(getComponent(peasant, healthComponent)?.valueMilli).toBe(
      100_000 - humanoidAttackDamageMilli,
    );
    let tick = 100;
    for (let hit = 0; hit < 40; hit += 1) {
      tick += attackCooldownTicks;
      attackIntruder(world.engine, contextOf(world, bear, {}, tick));
    }
    expect(getComponent(peasant, healthComponent)?.valueMilli).toBe(1_000);
  });

  it("attack_intruder walks to a humanoid that is out of reach", () => {
    const world = createAiWorld();
    const bear = world.spawn("bear", 0, noAiOverride);
    world.spawn("peasant", 5, noAiOverride);
    expect(attackIntruder(world.engine, contextOf(world, bear))).toBe(NodeStatus.Success);
    expect(queueLength(bear)).toBe(1);
  });

  it("registers every handler the animal trees name", () => {
    const world = createAiWorld();
    for (const id of ["animal_hungry", "threat_near", "humanoid_near", "hunt_urge"]) {
      expect(world.engine.behaviorHandlers.hasCondition(id)).toBe(true);
    }
    for (const id of ["flee_from_threat", "graze", "wander_animal", "attack_intruder"]) {
      expect(world.engine.behaviorHandlers.hasAction(id)).toBe(true);
    }
    expect(() => registerAnimalHandlers(world.engine)).toThrow();
  });
});
