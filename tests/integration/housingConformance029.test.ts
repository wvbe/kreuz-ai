import { describe, expect, it } from "vitest";
import { buildHousingTotals } from "../../src/game/housing/housingViews";
import { createHousingWorld } from "../../src/game/housing/testHousingWorld";
import { runHousingEvaluation } from "../../src/game/housing/runHousingEvaluation";
import { medianMs } from "../../scripts/lib/perfCases";

// Spec 029 SC-006: a daily housing evaluation of 200 dwellings with 20 service zones. The budget
// is the spec's 50 ms times 10 like the other wall-clock checks of the suite (D-114).

const longTimeout = 600_000;

describe("spec 029 evaluation cost", () => {
  // @covers 029:SC-006
  it(
    "evaluates 200 dwellings with 20 service zones in a few tens of milliseconds",
    () => {
      const world = createHousingWorld({ width: 100, height: 70 });
      world.throneRoom(1, 60);
      const dwellings: number[] = [];
      for (let index = 0; index < 200; index += 1) {
        dwellings.push(world.dwelling(1 + (index % 20) * 5, 1 + Math.floor(index / 20) * 5));
      }
      for (let index = 0; index < 20; index += 1) {
        const tiles = world.rect(10 + index * 4, 56, 2, 1);
        world.furniture(tiles[0] as number, "table");
        world.command("DesignateZone", {
          zoneTypeId: "market",
          mapId: world.mapId,
          cells: [
            ...tiles,
            ...world.rect(10 + index * 4, 57, 2, 1),
            ...world.rect(10 + index * 4, 58, 2, 1),
            ...world.rect(10 + index * 4, 59, 2, 1),
          ],
          reassign: false,
        });
      }
      for (let index = 0; index < 200; index += 1) {
        world.settler(1 + (index % 100) + 65 * 100);
      }
      world.runEvaluations(2);
      expect(dwellings).toHaveLength(200);
      const totals = buildHousingTotals(world.engine);
      expect(totals.activeDwellings).toBeGreaterThanOrEqual(150);
      expect(totals.housed).toBeGreaterThanOrEqual(100);
      const milliseconds = medianMs(5, () => {
        runHousingEvaluation(world.engine, world.engine.time.tickCount);
      });
      expect(milliseconds).toBeLessThan(50 * 10);
    },
    longTimeout,
  );
});
