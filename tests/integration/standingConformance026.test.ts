import { describe, expect, it } from "vitest";
import { runStewardReview } from "../../src/game/standing/runStewardReview";
import { createStandingWorld } from "../../src/game/standing/testStandingWorld";
import type { StandingTestWorld } from "../../src/game/standing/testStandingWorld";
import { medianMs } from "../../scripts/lib/perfCases";

// Spec 026 success criteria that need a bigger world than the unit tests build: the delay of a
// Steward posting by the distance of the board (SC-006) and the cost of a review (SC-007).

const width = 70;
const row = 5;

function boardWorld(boardColumn: number, withBell: boolean): StandingTestWorld {
  const world = createStandingWorld({ width, height: 10, boardCell: row * width + boardColumn });
  world.userBoard();
  world.throneRoom(5, row);
  world.steward(row * width + 2);
  world.crier(row * width + 6);
  world.spawn("sawmill", row * width + 30);
  if (withBell) {
    world.furniture(row * width + boardColumn - 3, "church_bell");
    world.zone("bell_tower", [row * width + boardColumn - 3]);
  }
  world.standing();
  return world;
}

// Ticks from the review that queued the run to the update being applied on the board, and how
// the update was delivered.
function delivery(world: StandingTestWorld): { ticks: number; via: string } {
  const applied = world.record("jobboard.update.applied");
  world.runToReview();
  const started = world.engine.time.tickCount;
  for (let tick = 0; tick < 600 && applied.length === 0; tick += 1) {
    world.run(1);
  }
  const via = (applied[0] as { via?: string } | undefined)?.via ?? "none";
  return { ticks: world.engine.time.tickCount - started, via };
}

describe("spec 026 delivery by distance", () => {
  // @covers 026:SC-006
  it("shows Steward postings later on a board 50 cells away than on one 5 cells away", () => {
    const near = delivery(boardWorld(10, false));
    const far = delivery(boardWorld(60, false));
    expect(near.via).toBe("TownCrier");
    expect(far.via).toBe("TownCrier");
    expect(far.ticks).toBeGreaterThan(near.ticks);
  });

  // @covers 026:SC-006
  it("bounds the delay by the gap to the next bell ring when a Bell Tower is in range", () => {
    const world = boardWorld(60, true);
    const rings = world.engine.content.constants.bellRingTicksOfDay;
    const result = delivery(world);
    const reviewTick = world.engine.content.constants.stewardReviewTickOfDay;
    const nextRing = Math.min(...rings.filter((slot) => slot > reviewTick));
    expect(result.via).toBe("BellTower");
    expect(result.ticks).toBeLessThanOrEqual(nextRing - reviewTick + 2);
  });
});

describe("spec 026 review cost", () => {
  // @covers 026:SC-007
  it("reviews 50 orders over 200 storage furniture in a few milliseconds (budget 5 ms x 10)", () => {
    const world = createStandingWorld({ width: 40, height: 40, boardCell: 0 });
    world.userBoard();
    world.throneRoom(5, 5);
    world.steward(2);
    world.spawn("sawmill", 30);
    const map = world.engine.maps.require(world.mapId);
    let chests = 0;
    for (let cell = 100; cell < map.cellCount && chests < 200; cell += 2) {
      if (
        map.isTraversable(cell) &&
        world.engine.store
          .entities()
          .every(
            (entity) =>
              (entity.components["Position"] as { cellIndex: number } | undefined)?.cellIndex !==
              cell,
          )
      ) {
        world.chest(cell);
        chests += 1;
      }
    }
    expect(chests).toBe(200);
    const free = (): number => {
      const cell = [...Array(map.cellCount).keys()].find(
        (candidate) =>
          candidate > 900 &&
          map.isTraversable(candidate) &&
          world.engine.store
            .entities()
            .every(
              (entity) =>
                (entity.components["Position"] as { cellIndex: number } | undefined)?.cellIndex !==
                candidate,
            ),
      );
      if (cell === undefined) {
        throw new Error("no free cell");
      }
      return cell;
    };
    const scopes: ({ zoneId: number } | undefined)[] = [
      undefined,
      { zoneId: world.zone("stockpile", [free()]) },
      { zoneId: world.zone("stockpile", [free() + 1]) },
    ];
    const recipes = world.engine.content.recipes
      .all()
      .filter((recipe) => recipe.unlockTier === undefined && recipe.outputs.length === 1);
    let orders = 0;
    for (const scope of scopes) {
      for (const recipe of recipes) {
        const materialId = recipe.outputs[0]?.materialId ?? "";
        if (orders < 50) {
          try {
            world.standing({
              materialId,
              recipeId: recipe.id,
              targetQuantity: 10,
              ...(scope === undefined ? {} : { scope }),
            });
            orders += 1;
          } catch {
            // an order the engine refuses (ambiguous, locked or a duplicate) is skipped
          }
        }
      }
    }
    expect(orders).toBe(50);
    const milliseconds = medianMs(5, () => {
      runStewardReview(world.engine, world.engine.time.tickCount);
    });
    expect(milliseconds).toBeLessThan(5 * 10);
  });
});
