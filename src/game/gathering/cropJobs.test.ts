import { describe, expect, it } from "vitest";
import { activePostingsOfType } from "../jobs/jobBoards";
import { skillValueMilli } from "../skills/skillLevels";
import { cropStageAt, sowCell } from "./cropPlots";
import { harvestJobTypeIds, postHarvestJobs, postSowJobs, registerCropJobs } from "./cropJobs";
import { getGatheringService } from "./gatheringServiceRegistry";
import { CropStage, gatheringMaxActivePostings, harvestJobId, sowJobId } from "./gatheringTypes";
import { materialStock } from "./materialStock";
import { createGatheringWorld } from "./testGatheringWorld";

describe("postSowJobs", () => {
  it("posts fallow cells of a working field, nearest first and bounded", () => {
    const world = createGatheringWorld();
    world.field(world.rect(2, 2, 4, 3));
    expect(postSowJobs(world.engine, 1)).toEqual([]);
    const created = postSowJobs(world.engine, 12);
    expect(created).toHaveLength(gatheringMaxActivePostings);
    const cells = activePostingsOfType(world.engine, sowJobId).map(
      (posting) => posting.target.cellIndex,
    );
    expect(cells.slice(0, 2)).toEqual([22, 23]);
    expect(postSowJobs(world.engine, 24)).toEqual([]);
  });

  it("posts nothing for an inactive field or for cells that are already sown", () => {
    const world = createGatheringWorld();
    world.field([22, 23]);
    expect(postSowJobs(world.engine, 12)).toEqual([]);
    const field = createGatheringWorld();
    field.field(field.rect(2, 2, 2, 2));
    for (const cell of [22, 23, 32, 33]) {
      sowCell(field.engine, field.mapId, cell);
    }
    expect(postSowJobs(field.engine, 12)).toEqual([]);
  });
});

describe("postHarvestJobs", () => {
  it("posts only ripe cells", () => {
    const world = createGatheringWorld();
    world.field(world.rect(2, 2, 2, 2));
    sowCell(world.engine, world.mapId, 22);
    sowCell(world.engine, world.mapId, 23);
    const service = getGatheringService(world.engine);
    const ripe = service.plotAt(world.mapId, 23);
    if (ripe !== undefined) {
      ripe.stage = CropStage.Ripe;
    }
    const created = postHarvestJobs(world.engine, 12);
    expect(created).toHaveLength(1);
    expect(activePostingsOfType(world.engine, harvestJobId)[0]?.target.cellIndex).toBe(23);
  });
});

describe("registerCropJobs", () => {
  it("is idempotent per engine through registerGathering (the engine registers it)", () => {
    const world = createGatheringWorld();
    expect(() => registerCropJobs(world.engine)).toThrow();
  });

  it("farms a field: sow, grow, harvest, wheat in the farmer's hands and farming XP gained", () => {
    const world = createGatheringWorld();
    world.field(world.rect(2, 2, 2, 2));
    const farmer = world.farmer(5);
    const before = skillValueMilli(farmer, "farming");
    world.run(1200);
    expect(world.count("wheat")).toBeGreaterThanOrEqual(4);
    expect(skillValueMilli(farmer, "farming")).toBeGreaterThan(before);
  });

  it("is deterministic: the same world gives the same hash and the same crop stages", () => {
    const first = createGatheringWorld();
    const second = createGatheringWorld();
    for (const world of [first, second]) {
      world.field(world.rect(2, 2, 2, 2));
      world.farmer(5);
      world.run(900);
    }
    expect(first.engine.getStateHash()).toBe(second.engine.getStateHash());
    expect(cropStageAt(first.engine, first.mapId, 22)).toBe(
      cropStageAt(second.engine, second.mapId, 22),
    );
  });

  it("gives a skilled farmer more wheat than an unskilled one (output bonus)", () => {
    const yields: number[] = [];
    for (const level of [0, 100_000]) {
      const world = createGatheringWorld();
      world.field(world.rect(2, 2, 2, 2));
      const farmer = world.spawn("farmer", 5, { Skills: { values: { farming: level } } });
      world.give(farmer, "bread", 8);
      world.run(1500);
      yields.push(world.count("wheat"));
    }
    const [novice, master] = yields;
    expect(novice ?? 0).toBeGreaterThan(0);
    expect(master ?? 0).toBeGreaterThan(novice ?? 0);
  });
});

describe("harvestJobTypeIds", () => {
  it("is farm.harvest plus the harvest job of every crop zone type", () => {
    expect(harvestJobTypeIds(createGatheringWorld().engine)).toEqual([
      "farm.harvest",
      "gather.fruit",
      "gather.herbs",
      "gather.grapes",
    ]);
  });
});

describe("crops beyond wheat", () => {
  it("posts sowing for a flax field and harvests flax into the farmer's hands", () => {
    const world = createGatheringWorld();
    world.zoneOver("flax_field", world.rect(2, 2, 2, 2), "fertile_soil");
    expect(postSowJobs(world.engine, 12)).toHaveLength(4);
    world.give(world.farmer(5), "bread", 8);
    world.run(1400);
    expect(world.count("flax")).toBeGreaterThanOrEqual(3);
    expect(world.count("wheat")).toBe(0);
  });

  it("does not post sowing for a perennial garden, and gathers herbs only while stock is low", () => {
    const world = createGatheringWorld();
    world.zoneOver("herb_garden", world.rect(2, 2, 3, 2), "fertile_soil");
    expect(postSowJobs(world.engine, 12)).toEqual([]);
    for (const plot of getGatheringService(world.engine).plots()) {
      plot.stage = CropStage.Ripe;
    }
    expect(postHarvestJobs(world.engine, 12)).toHaveLength(gatheringMaxActivePostings);
    expect(activePostingsOfType(world.engine, "gather.herbs")).toHaveLength(
      gatheringMaxActivePostings,
    );
    const full = createGatheringWorld();
    full.zoneOver("herb_garden", full.rect(2, 2, 3, 2), "fertile_soil");
    for (const plot of getGatheringService(full.engine).plots()) {
      plot.stage = CropStage.Ripe;
    }
    full.give(full.chest(8), "herbs", full.engine.content.constants.zoneGatherLowStock);
    expect(postHarvestJobs(full.engine, 12)).toEqual([]);
  });

  it("gathers herbs, replants and stops at the stock cap", () => {
    const world = createGatheringWorld();
    world.zoneOver("herb_garden", world.rect(2, 2, 3, 2), "fertile_soil");
    for (const cell of [5, 6]) {
      world.give(world.spawn("peasant", cell), "bread", 8);
    }
    world.run(1500);
    const cap = world.engine.content.constants.zoneGatherLowStock;
    expect(materialStock(world.engine, "herbs")).toBeGreaterThanOrEqual(3);
    expect(materialStock(world.engine, "herbs")).toBeLessThan(cap + 4 * 3);
  });
});
