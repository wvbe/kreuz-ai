import { describe, expect, it } from "vitest";
import { loadContent } from "../../src/game/content/ContentLoader";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { GameEngine } from "../../src/game/engine/GameEngine";
import { getNeedValue } from "../../src/game/ai/needs/needAccess";
import { MapSize } from "../../src/game/map/mapSize";
import { getTotal } from "../../src/game/inventory/inventoryQueries";

// Checkpoint B (plan 2.4): the six starting settlers of a new seed-42 Small game live on their
// own: they wander, eat, sleep, starve deterministically and survive save and load.

const dayTicks = 288;

function newGame(seed = 42): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed, mapSize: MapSize.Small });
  return engine;
}

function settlerIds(engine: GameEngine): number[] {
  return engine.store
    .entities()
    .filter((entity) => engine.content.humanoids.has(entity.prototype))
    .map((entity) => entity.id);
}

function cellOf(engine: GameEngine, id: number): number {
  return (engine.store.require(id).components["Position"] as { cellIndex: number }).cellIndex;
}

function removeAllBread(engine: GameEngine): void {
  // The settlers' own bread and the founders' bread in the storehouse chest (D-54).
  for (const entity of engine.store.entities()) {
    const inventory = entity.components["Inventory"] as
      { slots: { materialId: string }[] } | undefined;
    if (inventory !== undefined) {
      inventory.slots = inventory.slots.filter((slot) => slot.materialId !== "bread");
    }
  }
}

describe("Checkpoint B: settlers live autonomously (seed 42, Small)", () => {
  it("keeps all six alive for two game days, moving, eating, with hunger never at zero", () => {
    const engine = newGame();
    const ids = settlerIds(engine);
    expect(ids).toHaveLength(6);
    const eaten: JsonValue[] = [];
    engine.bus.subscribe("need.item.consumed", (payload) => eaten.push(payload));
    const start = new Map(ids.map((id) => [id, cellOf(engine, id)]));
    const visited = new Map(ids.map((id) => [id, new Set<number>([cellOf(engine, id)])]));
    let lowestHunger = 100_000;
    for (let tick = 0; tick < 2 * dayTicks; tick += 1) {
      engine.tick();
      for (const id of ids) {
        const entity = engine.store.get(id);
        expect(entity).toBeDefined();
        if (entity !== undefined) {
          visited.get(id)?.add(cellOf(engine, id));
          lowestHunger = Math.min(lowestHunger, getNeedValue(entity, "hunger") ?? 0);
        }
      }
    }
    expect(engine.time.tickCount).toBe(576);
    expect(settlerIds(engine)).toEqual(ids);
    for (const id of ids) {
      expect(visited.get(id)?.size ?? 0).toBeGreaterThan(1);
      expect(cellOf(engine, id)).not.toBe(start.get(id) ?? -1);
    }
    expect(lowestHunger).toBeGreaterThan(0);
    expect(eaten.length).toBeGreaterThanOrEqual(1);
    expect(eaten[0]).toMatchObject({ needId: "hunger", materialId: "bread", quantity: 1 });
    expect(engine.errors).toEqual([]);
  });

  it("lets settlers sleep when rest runs low", () => {
    const engine = newGame();
    const sleeping = new Set<number>();
    for (let tick = 0; tick < 3 * dayTicks; tick += 1) {
      engine.tick();
      for (const id of settlerIds(engine)) {
        const queue = engine.tasks.getQueue(id);
        if (queue?.tasks.some((task) => task.type === "ai.satisfy" && task.phase === "sleep")) {
          sleeping.add(id);
        }
      }
    }
    expect(sleeping.size).toBeGreaterThan(0);
  });

  it("starves deterministically when the food is gone: damage, death, deletion", () => {
    const run = (): { deaths: [number, number][]; deleted: JsonValue[] } => {
      const engine = newGame();
      removeAllBread(engine);
      const deaths: [number, number][] = [];
      const deleted: JsonValue[] = [];
      engine.bus.subscribe("entity.died", (payload) => {
        const record = payload as { entityId: number; cause: string };
        expect(record.cause).toBe("Starvation");
        deaths.push([engine.time.tickCount, record.entityId]);
      });
      engine.bus.subscribe("entity.deleted", (payload) => {
        // the envoys of diplomacy come and go as well; only citizens count here
        if ((payload as { prototypeId: string }).prototypeId !== "diplomatic_envoy") {
          deleted.push(payload);
        }
      });
      engine.runTicks(1300);
      return { deaths, deleted };
    };
    const first = run();
    const second = run();
    expect(first.deaths).toHaveLength(6);
    expect(first.deleted).toHaveLength(6);
    expect(second).toEqual(first);
    // hunger reaches zero at tick 534 and health (100%) falls 0.25% per tick from that tick on:
    // the first settler dies at tick 933 (hearty ones, with slower decay, later)
    const earliest = Math.min(...first.deaths.map(([tick]) => tick));
    expect(earliest).toBe(933);
    expect(Math.max(...first.deaths.map(([tick]) => tick))).toBeLessThanOrEqual(1300);
    expect(JSON.stringify(first.deleted[0])).toContain("name");
  });

  it("damages health while hunger is zero before anybody dies", () => {
    const engine = newGame();
    removeAllBread(engine);
    engine.runTicks(700);
    const id = settlerIds(engine)[0] as number;
    const health = (engine.store.require(id).components["Health"] as { valueMilli: number })
      .valueMilli;
    expect(getNeedValue(engine.store.require(id), "hunger")).toBe(0);
    expect(health).toBeLessThan(100_000);
    expect(health).toBeGreaterThan(0);
  });

  it("is deterministic: a 1000-tick soak twice ends in the same state hash", () => {
    const first = newGame();
    const second = newGame();
    first.runTicks(1000);
    second.runTicks(1000);
    expect(second.getStateHash()).toBe(first.getStateHash());
    expect(second.saveGame()).toBe(first.saveGame());
    expect(newGame(43).getStateHash()).not.toBe(newGame(42).getStateHash());
    const other = newGame(43);
    other.runTicks(1000);
    expect(other.getStateHash()).not.toBe(first.getStateHash());
  });

  it("save at tick 333, load, continue: equals the uninterrupted run", () => {
    const uninterrupted = newGame();
    uninterrupted.runTicks(1000);

    const interrupted = newGame();
    interrupted.runTicks(333);
    const save = interrupted.saveGame();
    const parsed = JSON.parse(save) as {
      entities: { components: { TaskQueue?: { tasks: unknown[] } } }[];
    };
    expect(
      parsed.entities.some((entity) => (entity.components.TaskQueue?.tasks.length ?? 0) > 0),
    ).toBe(true);

    const resumed = new GameEngine(loadContent(), { entropy: () => 1 });
    resumed.loadGame(save);
    expect(resumed.time.tickCount).toBe(333);
    resumed.runTicks(667);
    expect(resumed.getStateHash()).toBe(uninterrupted.getStateHash());
    expect(resumed.saveGame()).toBe(uninterrupted.saveGame());
  });

  it("decides in well under 5 ms per entity (spec 013 FR-019)", () => {
    const engine = newGame();
    engine.runTicks(10);
    const ids = settlerIds(engine);
    const started = performance.now();
    engine.runTicks(100);
    const perEntityTick = (performance.now() - started) / (100 * ids.length);
    expect(perEntityTick).toBeLessThan(5);
  });

  it("spends the starting bread: each settler holds less after two days", () => {
    const engine = newGame();
    const before = settlerIds(engine).map((id) => getTotal(engine.store.require(id), "bread"));
    engine.runTicks(2 * dayTicks);
    const after = settlerIds(engine).map((id) => getTotal(engine.store.require(id), "bread"));
    expect(after.reduce((sum, count) => sum + count, 0)).toBeLessThan(
      before.reduce((sum, count) => sum + count, 0),
    );
  });
});
