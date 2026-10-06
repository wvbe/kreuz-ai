import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import type { JsonValue } from "../engine/EventBus";
import { noAiOverride } from "../jobs/testJobWorld";
import { canAttack, damageHealth, removeAnimal, startAttackCooldown } from "./animalLifecycle";
import { animalDiedEvent, AnimalDeathCause, attackCooldownTicks } from "./faunaTypes";

describe("animal lifecycle", () => {
  it("removes an animal once, with an event and a deletion flag", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 0, noAiOverride);
    const seen: JsonValue[] = [];
    world.engine.bus.subscribe(animalDiedEvent, (payload) => seen.push(payload));
    expect(removeAnimal(world.engine, sheep, AnimalDeathCause.Butchered)).toBe(true);
    expect(world.engine.store.isPendingDelete(sheep.id)).toBe(true);
    expect(removeAnimal(world.engine, sheep, AnimalDeathCause.Butchered)).toBe(false);
    world.engine.runTicks(1);
    expect(world.engine.store.get(sheep.id)).toBeUndefined();
    expect(world.engine.maps.occupants.occupantsOf(world.mapId, 0)).toEqual([]);
    expect(seen).toEqual([{ entityId: sheep.id, prototypeId: "sheep", cause: "butchered" }]);
  });

  it("leaves non-animals alone", () => {
    const world = createAiWorld();
    const peasant = world.spawn("peasant", 0, noAiOverride);
    expect(removeAnimal(world.engine, peasant, AnimalDeathCause.Predation)).toBe(false);
    expect(world.engine.store.isPendingDelete(peasant.id)).toBe(false);
  });

  it("keeps the attack cooldown", () => {
    const world = createAiWorld();
    const wolf = world.spawn("wolf", 0, noAiOverride);
    const peasant = world.spawn("peasant", 1, noAiOverride);
    expect(canAttack(wolf, 10)).toBe(true);
    startAttackCooldown(wolf, 10);
    expect(canAttack(wolf, 10 + attackCooldownTicks - 1)).toBe(false);
    expect(canAttack(wolf, 10 + attackCooldownTicks)).toBe(true);
    expect(canAttack(peasant, 10)).toBe(false);
    expect(() => startAttackCooldown(peasant, 10)).not.toThrow();
  });

  it("takes health off down to a floor", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 0, noAiOverride);
    expect(damageHealth(sheep, 30_000, 0)).toBe(70_000);
    expect(damageHealth(sheep, 80_000, 1_000)).toBe(1_000);
    expect(damageHealth(sheep, 5_000, 1_000)).toBe(1_000);
    expect(damageHealth(sheep, 5_000, 0)).toBe(0);
  });

  it("does nothing to an entity without health", () => {
    const world = createAiWorld();
    const board = world.spawn("job_board", 0);
    expect(damageHealth(board, 10, 0)).toBeNull();
  });
});
