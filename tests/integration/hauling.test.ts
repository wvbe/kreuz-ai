import { describe, expect, it } from "vitest";
import { getComponent } from "../../src/game/ecs/Entity";
import type { Entity } from "../../src/game/ecs/Entity";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { getTotal } from "../../src/game/inventory/inventoryQueries";
import { MapSize } from "../../src/game/map/mapSize";
import { needsComponent } from "../../src/game/ai/needs/needsComponent";
import { getStorageService } from "../../src/game/storage/storageServiceRegistry";
import { createStorageWorld } from "../../src/game/storage/testStorageWorld";
import type { StorageTestWorld } from "../../src/game/storage/testStorageWorld";
import { haulJobId } from "../../src/game/storage/storageTypes";
import { CancelCategory, CancelReason } from "../../src/game/task/taskTypes";
import { loadContent } from "../../src/game/content/ContentLoader";
import { GameEngine } from "../../src/game/engine/GameEngine";

// Plan 3.2 acceptance: goods are never duplicated or lost while settlers haul them to storage,
// however often the work is interrupted, and a save in the middle of a haul continues
// identically.

const settlerCells = [11, 22, 33, 44];

function feed(world: StorageTestWorld, settlers: Entity[]): void {
  for (const settler of settlers) {
    for (const entry of getComponent(settler, needsComponent)?.values ?? []) {
      entry.valueMilli = 80_000;
    }
    world.give(settler, "bread", 1);
  }
}

function build() {
  const world = createStorageWorld();
  const chests = [world.chest(55), world.chest(58, { Inventory: { slotCount: 2 } })];
  const piles = [
    world.pile(15, [{ materialId: "oak_log", quantity: 18 }]),
    world.pile(76, [{ materialId: "oak_log", quantity: 9 }]),
    world.pile(91, [{ materialId: "oak_log", quantity: 14 }]),
  ];
  const settlers = settlerCells.map((cell) => world.spawn("peasant", cell));
  return { world, chests, piles, settlers };
}

function hasHaulTask(world: StorageTestWorld, entityId: number): boolean {
  return (
    world.engine.tasks.getQueue(entityId)?.tasks.some((task) => task.type === haulJobId) ?? false
  );
}

describe("hauling invariants", () => {
  it("conserves every log over 1000 ticks with interruptions and keeps reservations honest", () => {
    const { world, chests, settlers } = build();
    let expected = world.count("oak_log");
    expect(expected).toBe(41);
    let interruptions = 0;
    let hauls = 0;
    world.engine.bus.subscribe("jobboard.job.completed", (payload) => {
      if ((payload as { jobTypeId: string }).jobTypeId === haulJobId) {
        hauls += 1;
      }
    });
    for (let tick = 1; tick <= 1000; tick += 1) {
      if (tick % 97 === 0) {
        feed(world, settlers);
      }
      if (tick === 150 || tick === 400 || tick === 700) {
        world.pile(30 + tick / 50, [{ materialId: "oak_log", quantity: 7 }]);
        expected += 7;
      }
      world.run(1);
      if (tick % 7 === 0) {
        const victim = settlers[tick % settlers.length];
        if (victim !== undefined && hasHaulTask(world, victim.id)) {
          world.engine.tasks.interrupt(victim.id, {
            category: CancelCategory.Graceful,
            reason: CancelReason.InterruptedByPriority,
          });
          interruptions += 1;
        }
      }
      expect(world.count("oak_log")).toBe(expected);
      for (const reservation of getStorageService(world.engine).reservations.all()) {
        const holder = world.engine.store.get(reservation.holderId);
        expect(holder).toBeDefined();
        expect(hasHaulTask(world, reservation.holderId)).toBe(true);
        const owner = world.engine.store.require(reservation.inventoryOwnerId);
        expect(getTotal(owner, reservation.materialId)).toBeGreaterThanOrEqual(
          reservation.quantity,
        );
      }
    }
    expect(settlers.every((settler) => world.engine.store.has(settler.id))).toBe(true);
    expect(interruptions).toBeGreaterThan(5);
    expect(hauls).toBeGreaterThan(5);
    const stored = chests.reduce((sum, chest) => sum + getTotal(chest, "oak_log"), 0);
    expect(stored).toBeGreaterThan(20);
  });

  it("is deterministic and identical after a save and load in the middle of a haul", () => {
    const run = (ticks: number) => {
      const built = build();
      built.world.run(ticks);
      return built;
    };
    const reference = run(300);
    const first = build();
    let saved = "";
    for (let tick = 1; tick <= 300 && saved === ""; tick += 1) {
      first.world.run(1);
      const busy = first.settlers.some((settler) => {
        const task = first.world.engine.tasks
          .getQueue(settler.id)
          ?.tasks.find((candidate) => candidate.type === haulJobId);
        return task !== undefined && task.phase === "to-destination";
      });
      if (busy) {
        saved = first.world.engine.saveGame();
        first.world.run(300 - tick);
        break;
      }
    }
    expect(saved).not.toBe("");
    expect(first.world.engine.getStateHash()).toBe(reference.world.engine.getStateHash());
    const resumed = createStorageWorld();
    resumed.engine.loadGame(saved);
    const savedTick = resumed.engine.time.tickCount;
    expect(savedTick).toBeGreaterThan(0);
    resumed.run(300 - savedTick);
    expect(resumed.engine.getStateHash()).toBe(reference.world.engine.getStateHash());
    expect(resumed.engine.saveGame()).toBe(reference.world.engine.saveGame());
  });
});

describe("a new game hauls felled logs into the stockpile (seed 42, Small)", () => {
  it("ends with logs in the chest, nothing duplicated, and is deterministic", () => {
    const game = () => {
      const engine = new GameEngine(loadContent(), { entropy: () => 1 });
      engine.newGame({ seed: 42, mapSize: MapSize.Small });
      return engine;
    };
    const felled: JsonValue[] = [];
    const engine = game();
    engine.bus.subscribe("jobboard.job.completed", (payload) => {
      if ((payload as { jobTypeId: string }).jobTypeId === "fell.trees") {
        felled.push(payload);
      }
    });
    engine.runTicks(576);
    const chest = engine.store.require(9);
    expect(chest.prototype).toBe("chest");
    expect(getTotal(chest, "oak_log")).toBeGreaterThan(0);
    const everywhere = engine.store
      .entities()
      .reduce(
        (sum, entity) =>
          sum + (entity.components["Inventory"] === undefined ? 0 : getTotal(entity, "oak_log")),
        0,
      );
    expect(everywhere).toBe(3 * felled.length);
    const twin = game();
    twin.runTicks(576);
    expect(twin.getStateHash()).toBe(engine.getStateHash());
  });
});
