import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { loadContent } from "../content/ContentLoader";
import { AnimalKind } from "../content/contentTypes";
import type { JsonValue } from "../engine/EventBus";
import { GameEngine } from "../engine/GameEngine";
import { MapSize } from "../map/mapSize";
import { noAiOverride } from "../jobs/testJobWorld";
import { animalWakesForThreat, registerFauna, wakeScanInterval } from "./registerFauna";
import { FaunaTaskPriority } from "./faunaTypes";

describe("registerFauna", () => {
  it("is registered by every engine, once", () => {
    const world = createAiWorld();
    expect(() => registerFauna(world.engine)).not.toThrow();
    expect(world.engine.getQuery("animals")).toBeDefined();
    expect(world.engine.prototypes.has("deer")).toBe(true);
    expect(world.engine.prototypes.has("sheep")).toBe(true);
  });

  it("answers the animals query with an optional filter", () => {
    const world = createAiWorld();
    world.spawn("sheep", 1, noAiOverride);
    world.spawn("fox", 2, noAiOverride);
    const query = world.engine.getQuery("animals");
    expect(query?.run({}, world.engine)).toMatchObject({ animals: [{}, {}] });
    const wild = query?.run({ kind: AnimalKind.Wild }, world.engine) as { animals: JsonValue[] };
    expect(wild.animals).toHaveLength(1);
    expect(() => query?.run({ kind: "pet" }, world.engine)).toThrow();
  });

  it("places wild animals in a new game with a world, none without one, none on load", () => {
    const withWorld = new GameEngine(loadContent(), { entropy: () => 1 });
    withWorld.newGame({ seed: 42, mapSize: MapSize.Small });
    const animals = withWorld.store
      .entities()
      .filter((entity) => entity.components["Animal"] !== undefined);
    expect(animals.length).toBeGreaterThan(0);
    expect(animals.every((entity) => entity.components["Animal"]?.["kind"] === "wild")).toBe(true);
    const saved = withWorld.saveGame();
    withWorld.loadGame(saved);
    expect(
      withWorld.store.entities().filter((entity) => entity.components["Animal"] !== undefined),
    ).toHaveLength(animals.length);
    const bare = new GameEngine(loadContent(), { entropy: () => 1 });
    bare.newGame({ seed: 42 });
    expect(
      bare.store.entities().filter((entity) => entity.components["Animal"] !== undefined),
    ).toEqual([]);
  });

  it("wakes a busy animal only when a threat is near, on its scan tick", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 0, noAiOverride);
    const peasant = world.spawn("peasant", 99, noAiOverride);
    const scanTick = (wakeScanInterval - (deer.id % wakeScanInterval)) % wakeScanInterval;
    world.engine.runTicks(scanTick + wakeScanInterval);
    expect((world.engine.time.tickCount + deer.id) % wakeScanInterval).toBe(0);
    expect(animalWakesForThreat(world.engine, deer)).toBe(false);
    world.engine.maps.moveEntity(peasant.id, 3);
    (peasant.components["Position"] as { cellIndex: number }).cellIndex = 3;
    expect(animalWakesForThreat(world.engine, deer)).toBe(true);
    world.engine.tasks.enqueue(deer.id, {
      type: "ai.idle",
      data: { ticks: 5 },
      priority: FaunaTaskPriority.Flee,
    });
    expect(animalWakesForThreat(world.engine, deer)).toBe(false);
    expect(animalWakesForThreat(world.engine, peasant)).toBe(false);
  });

  it("does not wake animals that never flee, nor off their scan tick", () => {
    const world = createAiWorld();
    const bear = world.spawn("bear", 0, noAiOverride);
    world.spawn("peasant", 1, noAiOverride);
    const deer = world.spawn("deer", 90, noAiOverride);
    world.spawn("peasant", 91, noAiOverride);
    const results = Array.from({ length: wakeScanInterval }, () => {
      world.engine.runTicks(1);
      return animalWakesForThreat(world.engine, deer);
    });
    expect(results.filter((woke) => woke)).toHaveLength(1);
    for (let tick = 0; tick < wakeScanInterval; tick += 1) {
      world.engine.runTicks(1);
      expect(animalWakesForThreat(world.engine, bear)).toBe(false);
    }
  });
});
