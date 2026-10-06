import { describe, expect, it } from "vitest";
import { sowCell } from "./cropPlots";
import { getGatheringService } from "./gatheringServiceRegistry";
import { CropStage } from "./gatheringTypes";
import { buildCropsView } from "./buildCropsView";
import { createGatheringWorld } from "./testGatheringWorld";

describe("buildCropsView", () => {
  it("lists every fertile field cell with its stage and growth", () => {
    const world = createGatheringWorld();
    const zoneId = world.field(world.rect(2, 2, 2, 2));
    sowCell(world.engine, world.mapId, 23);
    const plot = getGatheringService(world.engine).plotAt(world.mapId, 23);
    if (plot !== undefined) {
      plot.growthMilli = 432_000;
    }
    const view = buildCropsView(world.engine);
    expect(view.map((cell) => [cell.cellIndex, cell.stage])).toEqual([
      [22, CropStage.Fallow],
      [23, CropStage.Sown],
      [32, CropStage.Fallow],
      [33, CropStage.Fallow],
    ]);
    expect(view[1]).toMatchObject({
      zoneId,
      materialId: "wheat",
      growthPermille: 500,
      ticksToRipe: 432,
    });
    expect(view[0]).toMatchObject({ growthPermille: 0, ticksToRipe: null, materialId: "wheat" });
  });

  it("filters by zone and skips cells of other terrain and other zone types", () => {
    const world = createGatheringWorld();
    const first = world.field(world.rect(1, 1, 2, 2));
    const second = world.field(world.rect(5, 5, 2, 2));
    world.terrain(11, "grassland");
    world.designate("stockpile", world.rect(8, 1, 2, 2));
    expect(buildCropsView(world.engine, first).map((cell) => cell.cellIndex)).toEqual([12, 21, 22]);
    expect(buildCropsView(world.engine, second)).toHaveLength(4);
    expect(buildCropsView(world.engine)).toHaveLength(7);
    expect(buildCropsView(world.engine, 9999)).toEqual([]);
  });
});
