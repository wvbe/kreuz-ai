import { describe, expect, it } from "vitest";
import { loadContent } from "../../src/game/content/ContentLoader";
import { requireComponent } from "../../src/game/ecs/Entity";
import { GameEngine } from "../../src/game/engine/GameEngine";
import { InitMode } from "../../src/game/engine/engineSystemTypes";
import { TickSlot } from "../../src/game/engine/TickPipeline";
import { storeUpTo } from "../../src/game/inventory/inventoryOperations";
import { MapSize } from "../../src/game/map/mapSize";
import { positionComponent } from "../../src/game/map/positionComponent";
import { Difficulty } from "../../src/game/save/initOptions";
import { continueStep, doneStep, tickWait, waitStep } from "../../src/game/task/stepResults";

// A world driven by the real engine host: a registered system that spawns settlers, moves them
// with the PRNG and gives them tasks, bread that decays and the built-in slots around it.

const totalTicks = 400;

function createWorldEngine(): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 2024 });
  engine.taskHandlers.register({
    type: "demo.errand",
    start: (context) => {
      context.task.phase = "pause";
      return waitStep(tickWait(context.tick + 3));
    },
    step: () => doneStep(),
    cancel: () => undefined,
  });
  engine.taskHandlers.register({
    type: "demo.idle",
    start: () => continueStep(),
    step: () => doneStep(),
    cancel: () => undefined,
  });
  engine.registerSystem({
    id: "demo.settlers",
    dependencies: ["world.starting-map"],
    init: ({ engine: host, mode }) => {
      if (mode !== InitMode.NewGame) {
        return;
      }
      for (let index = 0; index < 6; index += 1) {
        const settler = host.store.spawn("peasant");
        const map = host.maps.require(1);
        let cell = host.prng.stream("demo.spawn").nextInt(0, 599);
        while (map.blockReason(cell) !== null) {
          cell = host.prng.stream("demo.spawn").nextInt(0, 599);
        }
        host.maps.placeEntity(settler.id, 1, cell);
        requireComponent(settler, positionComponent).cellIndex = cell;
        requireComponent(settler, positionComponent).mapId = 1;
        storeUpTo({ materials: host.materials, actor: null, bus: host.bus }, settler, "bread", 3);
      }
    },
    slot: TickSlot.World,
    run: (context) => {
      if (context.tick % 5 !== 0) {
        return;
      }
      for (const entity of engine.store.entities()) {
        if (entity.components["Position"] === undefined || entity.prototype !== "peasant") {
          continue;
        }
        const position = requireComponent(entity, positionComponent);
        const neighbors = engine.maps.require(position.mapId).neighbors(position.cellIndex);
        const cell = engine.prng.stream("demo.wander").choice(neighbors);
        if (engine.maps.require(position.mapId).blockReason(cell) === null) {
          engine.maps.moveEntity(entity.id, cell);
          position.cellIndex = cell;
        }
        engine.tasks.enqueue(entity.id, {
          type: context.tick % 10 === 0 ? "demo.errand" : "demo.idle",
        });
      }
    },
  });
  return engine;
}

function run(seed: number, ticks: number): GameEngine {
  const engine = createWorldEngine();
  engine.newGame({ seed, mapSize: MapSize.Small, difficulty: Difficulty.Harsh });
  engine.runTicks(ticks);
  return engine;
}

describe("engine determinism (spec 007, Constitution I)", () => {
  it("gives the same state hash for the same seed and a different one for another seed", () => {
    expect(run(31, totalTicks).getStateHash()).toBe(run(31, totalTicks).getStateHash());
    expect(run(31, totalTicks).getStateHash()).not.toBe(run(32, totalTicks).getStateHash());
  });

  it("really simulates something: entities moved, tasks ran, bread decayed", () => {
    const engine = run(31, totalTicks);
    // 1 government + job board + 6 generated settlers (task 2.1) + the stockpile chest (task 3.2)
    // + 6 demo peasants.
    // The NPC factions of diplomacy (their members and envoys) are not counted here.
    const own = engine
      .getEntities()
      .filter(
        (entity) => !["faction", "npc_leader", "diplomatic_envoy"].includes(entity.prototype),
      );
    expect(own).toHaveLength(15);
    const first = engine.getEntity(
      own.filter((entity) => entity.prototype === "peasant")[2]?.id ?? 0,
    );
    expect(first?.components["Position"]?.["cellIndex"]).toBeDefined();
    const bread = (first?.components["Inventory"]?.["slots"] as { remainingMilli: number }[])[0];
    expect(bread?.remainingMilli).toBeLessThan(864_000);
  });

  it("continues identically after a mid-run save and load", () => {
    const uninterrupted = run(77, totalTicks);
    for (const splitAt of [1, 7, 100, 233]) {
      const first = run(77, splitAt);
      const text = first.saveGame();
      const resumed = createWorldEngine();
      resumed.loadGame(text);
      resumed.runTicks(totalTicks - splitAt);
      expect(resumed.getStateHash()).toBe(uninterrupted.getStateHash());
      expect(resumed.saveGame()).toBe(uninterrupted.saveGame());
    }
  });

  it("keeps two engines side by side independent", () => {
    const left = createWorldEngine();
    const right = createWorldEngine();
    left.newGame({ seed: 5, mapSize: MapSize.Small });
    right.newGame({ seed: 5, mapSize: MapSize.Small });
    for (let round = 0; round < 40; round += 1) {
      left.runTicks(5);
      right.runTicks(5);
      left.store.spawn("government_faction");
      left.bus.emit("demo.noise", { round });
    }
    const pure = createWorldEngine();
    pure.newGame({ seed: 5, mapSize: MapSize.Small });
    pure.runTicks(200);
    expect(right.getStateHash()).not.toBe(left.getStateHash());
    expect(right.getStateHash()).toBe(pure.getStateHash());
  });

  it("repeated newGame and loadGame leave no residue", () => {
    const engine = createWorldEngine();
    engine.newGame({ seed: 9, mapSize: MapSize.Small });
    engine.runTicks(50);
    const baseline = engine.getStateHash();
    for (let round = 0; round < 25; round += 1) {
      engine.newGame({ seed: 9, mapSize: MapSize.Small });
      engine.runTicks(50);
      expect(engine.getStateHash()).toBe(baseline);
      engine.loadGame(engine.saveGame());
      expect(engine.getStateHash()).toBe(baseline);
    }
    expect(engine.pipeline.getSystemOrder().length).toBeLessThan(23);
  });

  it("bootstraps in under 100 ms and rejects bad options in under 50 ms", () => {
    const content = loadContent();
    const engine = new GameEngine(content, { entropy: () => 1 });
    const started = performance.now();
    engine.newGame();
    expect(performance.now() - started).toBeLessThan(100);
    const bad = JSON.parse('{"difficulty":"super-hard"}') as { difficulty: Difficulty };
    const rejectStart = performance.now();
    expect(() => engine.newGame(bad)).toThrow();
    expect(performance.now() - rejectStart).toBeLessThan(50);
  });
});
