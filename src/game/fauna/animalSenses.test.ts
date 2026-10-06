import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { noAiOverride } from "../jobs/testJobWorld";
import {
  animalContentOf,
  isGuard,
  isHumanoid,
  isPredator,
  isPreyOf,
  matchesSense,
  senseNearest,
} from "./animalSenses";
import { SenseKind } from "./faunaTypes";

describe("animal senses", () => {
  it("reads the content record of an animal and of nothing else", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 0, noAiOverride);
    const peasant = world.spawn("peasant", 1, noAiOverride);
    expect(animalContentOf(world.engine, deer)?.id).toBe("deer");
    expect(animalContentOf(world.engine, peasant)).toBeUndefined();
  });

  it("tells humanoids, guards and predators apart", () => {
    const world = createAiWorld();
    const peasant = world.spawn("peasant", 0, noAiOverride);
    const guard = world.spawn("guard", 1, noAiOverride);
    const wolf = world.spawn("wolf", 2, noAiOverride);
    const deer = world.spawn("deer", 3, noAiOverride);
    expect(isHumanoid(peasant)).toBe(true);
    expect(isHumanoid(wolf)).toBe(false);
    expect(isGuard(guard)).toBe(true);
    expect(isGuard(peasant)).toBe(false);
    expect(isPredator(world.engine, wolf)).toBe(true);
    expect(isPredator(world.engine, deer)).toBe(false);
    expect(isPredator(world.engine, peasant)).toBe(false);
  });

  it("knows the prey of a predator from its record", () => {
    const world = createAiWorld();
    const wolf = world.spawn("wolf", 0, noAiOverride);
    const sheep = world.spawn("sheep", 1, noAiOverride);
    const horse = world.spawn("horse", 2, noAiOverride);
    const peasant = world.spawn("peasant", 3, noAiOverride);
    expect(isPreyOf(world.engine, wolf, sheep)).toBe(true);
    expect(isPreyOf(world.engine, wolf, horse)).toBe(false);
    expect(isPreyOf(world.engine, wolf, peasant)).toBe(false);
    expect(isPreyOf(world.engine, sheep, wolf)).toBe(false);
  });

  it("matches the sense kinds", () => {
    const world = createAiWorld();
    const peasant = world.spawn("peasant", 0, noAiOverride);
    const bear = world.spawn("bear", 1, noAiOverride);
    expect(matchesSense(world.engine, SenseKind.Humanoid, peasant)).toBe(true);
    expect(matchesSense(world.engine, SenseKind.Humanoid, bear)).toBe(false);
    expect(matchesSense(world.engine, SenseKind.Predator, bear)).toBe(true);
    expect(matchesSense(world.engine, SenseKind.Predator, peasant)).toBe(false);
  });

  it("finds the nearest accepted entity within the radius, never itself", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 0, noAiOverride);
    const far = world.spawn("peasant", 5, noAiOverride);
    const near = world.spawn("peasant", 2, noAiOverride);
    const found = senseNearest(world.engine, deer, 80, isHumanoid);
    expect(found?.entity.id).toBe(near.id);
    expect(found?.cell).toBe(2);
    expect(found?.cost).toBe(20);
    expect(senseNearest(world.engine, deer, 30, (other) => other.id === far.id)).toBeNull();
    expect(senseNearest(world.engine, deer, 80, (other) => other.id === deer.id)).toBeNull();
    expect(senseNearest(world.engine, deer, 0, isHumanoid)).toBeNull();
  });

  it("breaks ties between entities on one cell by lowest id and skips deleted ones", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 0, noAiOverride);
    const first = world.spawn("peasant", 3, noAiOverride);
    const second = world.spawn("peasant", 3, noAiOverride);
    expect(senseNearest(world.engine, deer, 80, isHumanoid)?.entity.id).toBe(first.id);
    world.engine.store.requestDelete(first.id);
    expect(senseNearest(world.engine, deer, 80, isHumanoid)?.entity.id).toBe(second.id);
  });
});
