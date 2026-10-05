import { describe, expect, it } from "vitest";
import { loadContent } from "../../src/game/content/ContentLoader";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { GameEngine } from "../../src/game/engine/GameEngine";
import { getTotal } from "../../src/game/inventory/inventoryQueries";
import { getBalance } from "../../src/game/inventory/inventoryMoney";
import { MapSize } from "../../src/game/map/mapSize";

// Plan 3.1: the six starting settlers of a new seed-42 Small game claim `fell.trees` jobs from the
// village board on their own: trees fall, logs and wages reach their inventories, and the whole
// thing is deterministic and survives save and load in the middle of a job.

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

function logsHeld(engine: GameEngine): number {
  return settlerIds(engine).reduce(
    (sum, id) => sum + getTotal(engine.store.require(id), "oak_log"),
    0,
  );
}

function logsStored(engine: GameEngine): number {
  return getTotal(engine.store.require(9), "oak_log");
}

function coinsHeld(engine: GameEngine): number {
  const context = { materials: engine.materials, actor: null };
  return settlerIds(engine).reduce(
    (sum, id) => sum + getBalance(context, engine.store.require(id)),
    0,
  );
}

function collect(engine: GameEngine, name: string): JsonValue[] {
  const seen: JsonValue[] = [];
  engine.bus.subscribe(name, (payload) => seen.push(payload));
  return seen;
}

describe("first jobs (seed 42, Small)", () => {
  it("fells trees for a day: logs and wages appear, trees become grassland, nobody starves", () => {
    const engine = newGame();
    const completed = collect(engine, "jobboard.job.completed");
    const claimed = collect(engine, "jobboard.job.claimed");
    const before = logsHeld(engine) + logsStored(engine);
    const coinsBefore = coinsHeld(engine);
    engine.runTicks(dayTicks);
    const felled = completed.filter(
      (entry) => (entry as { jobTypeId: string }).jobTypeId === "fell.trees",
    );
    expect(claimed.length).toBeGreaterThan(0);
    expect(felled.length).toBeGreaterThan(0);
    // The logs are in the settlers' inventories or in the chest (task 3.2 hauls them there).
    expect(logsHeld(engine) + logsStored(engine) - before).toBe(3 * felled.length);
    expect(logsStored(engine)).toBeGreaterThan(0);
    expect(coinsHeld(engine) - coinsBefore).toBe(2 * felled.length);
    const first = felled[0] as { workerId: number; wage: number; jobTypeId: string };
    expect(first.jobTypeId).toBe("fell.trees");
    expect(first.wage).toBe(2);
    expect(settlerIds(engine)).toHaveLength(6);
    const board = engine.store.require(2).components["JobBoard"] as {
      history: { status: string; jobTypeId: string; target: { cellIndex: number } }[];
    };
    const done = board.history.filter(
      (posting) => posting.status === "done" && posting.jobTypeId === "fell.trees",
    );
    expect(done.length).toBeGreaterThan(0);
    const map = engine.maps.require(1);
    for (const posting of done) {
      expect(map.terrainAt(posting.target.cellIndex)).toBe("grassland");
    }
  });

  it("never double claims: every posting has at most one live claim and claims are unique", () => {
    const engine = newGame();
    const claims: { postingId: number; claimId: number; entityId: number }[] = [];
    engine.bus.subscribe("jobboard.job.claimed", (payload) => {
      claims.push(payload as (typeof claims)[number]);
    });
    for (let tick = 0; tick < dayTicks; tick += 1) {
      engine.tick();
      const board = engine.store.require(2).components["JobBoard"] as {
        postings: { id: number; status: string; claimantId: number | null }[];
      };
      const holders = board.postings
        .filter((posting) => posting.status === "claimed")
        .map((posting) => posting.claimantId);
      expect(new Set(holders).size).toBe(holders.length);
    }
    expect(new Set(claims.map((claim) => claim.claimId)).size).toBe(claims.length);
  });

  it("is deterministic: two runs give the same hash", () => {
    const first = newGame();
    const second = newGame();
    first.runTicks(dayTicks);
    second.runTicks(dayTicks);
    expect(first.getStateHash()).toBe(second.getStateHash());
  });

  it("save and load in the middle of a job continues identically", () => {
    const reference = newGame();
    reference.runTicks(2 * dayTicks);
    const engine = newGame();
    let saved = "";
    for (let tick = 0; tick < dayTicks && saved === ""; tick += 1) {
      engine.tick();
      const board = engine.store.require(2).components["JobBoard"] as {
        postings: { status: string }[];
      };
      if (tick > 40 && board.postings.some((posting) => posting.status === "claimed")) {
        saved = engine.saveGame();
      }
    }
    expect(saved).not.toBe("");
    const resumed = new GameEngine(loadContent(), { entropy: () => 1 });
    resumed.loadGame(saved);
    while (resumed.time.tickCount < 2 * dayTicks) {
      resumed.tick();
    }
    expect(resumed.getStateHash()).toBe(reference.getStateHash());
  });
});
