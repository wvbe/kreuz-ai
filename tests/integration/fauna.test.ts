import { describe, expect, it } from "vitest";
import { createAiWorld } from "../../src/game/ai/testAiWorld";
import type { AiTestWorld } from "../../src/game/ai/testAiWorld";
import { healthComponent } from "../../src/game/ai/needs/healthComponent";
import { loadContent } from "../../src/game/content/ContentLoader";
import { getComponent } from "../../src/game/ecs/Entity";
import type { Entity } from "../../src/game/ecs/Entity";
import { GameEngine } from "../../src/game/engine/GameEngine";
import { buildSettlementView } from "../../src/game/api/viewBuilders";
import { buildAnimalsView } from "../../src/game/fauna/animalViews";
import { FaunaTaskPriority } from "../../src/game/fauna/faunaTypes";
import { getTotal } from "../../src/game/inventory/inventoryQueries";
import { createJobWorld, noAiOverride } from "../../src/game/jobs/testJobWorld";
import { MapSize } from "../../src/game/map/mapSize";
import { taskQueueComponent } from "../../src/game/task/taskQueueComponent";
import { positionComponent } from "../../src/game/map/positionComponent";

// Task 5.3 part 2b: animals live by their behavior trees next to the settlers (spec 022 US11 and
// US14 scenarios) without changing what the settlers do.

function cellOf(entity: Entity): number {
  return getComponent(entity, positionComponent)?.cellIndex ?? -1;
}

function column(cell: number): number {
  return cell % 10;
}

function alive(world: AiTestWorld, entity: Entity): boolean {
  return world.engine.store.get(entity.id) !== undefined;
}

describe("animals next to settlers", () => {
  it("makes deer flee from a settler and stay away from it", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 55);
    const settler = world.spawn("peasant", 52, noAiOverride);
    const before = Math.abs(column(cellOf(deer)) - column(cellOf(settler)));
    world.run(40);
    const after = Math.abs(column(cellOf(deer)) - column(cellOf(settler)));
    expect(after).toBeGreaterThan(before);
  });

  it("does not make a livestock animal flee from a settler", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 55);
    world.spawn("peasant", 54, noAiOverride);
    world.run(8);
    const tasks = getComponent(sheep, taskQueueComponent)?.tasks ?? [];
    expect(tasks.every((task) => task.priority < FaunaTaskPriority.Flee)).toBe(true);
  });

  it("makes livestock flee from a wolf", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 55);
    world.spawn("wolf", 53, noAiOverride);
    const before = cellOf(sheep);
    world.run(10);
    expect(cellOf(sheep)).not.toBe(before);
    expect(column(cellOf(sheep))).toBeGreaterThan(column(before));
  });

  it("lets a wolf kill a sheep that cannot get away, and removes it from the animals", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 55, noAiOverride);
    const wolf = world.spawn("wolf", 56);
    world.run(300);
    expect(alive(world, sheep)).toBe(false);
    expect(alive(world, wolf)).toBe(true);
    expect(buildAnimalsView(world.engine).animals.map((row) => row.prototypeId)).toEqual(["wolf"]);
  });

  it("keeps a wolf from livestock while a guard is within sight, and the guard drives it off", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 55, noAiOverride);
    const wolf = world.spawn("wolf", 56);
    world.spawn("guard", 58);
    world.run(300);
    expect(alive(world, wolf)).toBe(false);
    expect(alive(world, sheep)).toBe(true);
    expect(getComponent(sheep, healthComponent)?.valueMilli).toBe(100_000);
  });

  it("lets a fox steal an unguarded chicken", () => {
    const world = createAiWorld();
    const chicken = world.spawn("chicken", 55, noAiOverride);
    world.spawn("fox", 56);
    world.run(200);
    expect(alive(world, chicken)).toBe(false);
  });

  it("lets a bear hurt a settler in reach without killing it", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 55, noAiOverride);
    world.spawn("bear", 56);
    world.run(200);
    const health = getComponent(settler, healthComponent)?.valueMilli ?? 0;
    expect(health).toBeLessThan(100_000);
    expect(health).toBeGreaterThanOrEqual(1_000);
    expect(alive(world, settler)).toBe(true);
  });

  it("gives the new role trees to the new humanoids: a mason works like a settler of v0", () => {
    const world = createJobWorld();
    const mason = world.spawn("mason", 12);
    expect(mason.components["AiState"]?.["treeId"]).toBe("daily_routine");
    world.postFell(22);
    world.run(300);
    expect(getTotal(mason, "oak_log")).toBe(3);
  });

  it("does not change what a settler does when animals are around (own PRNG streams)", () => {
    const walk = (withAnimals: boolean): number[] => {
      const world = createAiWorld({ seed: 11 });
      const settler = world.spawn("peasant", 0);
      if (withAnimals) {
        world.spawn("deer", 99);
        world.spawn("rabbit", 90);
        world.spawn("wolf", 95);
      }
      const cells: number[] = [];
      for (let round = 0; round < 12; round += 1) {
        world.run(10);
        cells.push(cellOf(settler));
      }
      return cells;
    };
    expect(walk(true)).toEqual(walk(false));
  });
});

describe("a seed-42 Small game with wildlife", () => {
  function newGame(): GameEngine {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 42, mapSize: MapSize.Small });
    return engine;
  }

  it("keeps animals out of the population and the settlers' ids", () => {
    const engine = newGame();
    expect(buildSettlementView(engine).population).toBe(6);
    expect(engine.store.require(3).prototype).toBe("farmer");
    expect(engine.store.require(9).prototype).toBe("chest");
    expect(buildAnimalsView(engine).animals.length).toBeGreaterThan(0);
  });

  it("moves its animals, and a save in the middle resumes to the same state", () => {
    const engine = newGame();
    const start = buildAnimalsView(engine).animals.map((row) => row.cellIndex);
    engine.runTicks(150);
    const saved = engine.saveGame();
    engine.runTicks(150);
    const hash = engine.getStateHash();
    expect(buildAnimalsView(engine).animals.map((row) => row.cellIndex)).not.toEqual(start);
    const other = new GameEngine(loadContent(), { entropy: () => 1 });
    other.loadGame(saved);
    other.runTicks(150);
    expect(other.getStateHash()).toBe(hash);
  });
});
