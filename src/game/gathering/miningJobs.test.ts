import { describe, expect, it } from "vitest";
import { activePostingsOfType } from "../jobs/jobBoards";
import { skillValueMilli } from "../skills/skillLevels";
import { chargesLeft } from "./deposits";
import { getGatheringService } from "./gatheringServiceRegistry";
import { depositMaxActivePostings, mineOreJobId, quarryStoneJobId } from "./gatheringTypes";
import { materialStock } from "./materialStock";
import { postMineJobs, postQuarryJobs, registerDepositJob, registerMiningJobs } from "./miningJobs";
import { createGatheringWorld } from "./testGatheringWorld";

describe("postMineJobs", () => {
  it("posts the nearest ore deposits only while the stock is low, bounded", () => {
    const world = createGatheringWorld();
    for (const cell of [31, 32, 33, 34]) {
      world.terrain(cell, "iron_ore_deposit");
    }
    expect(postMineJobs(world.engine, 5)).toEqual([]);
    const created = postMineJobs(world.engine, 12);
    expect(created).toHaveLength(depositMaxActivePostings);
    const cells = activePostingsOfType(world.engine, mineOreJobId).map(
      (posting) => posting.target.cellIndex,
    );
    expect(cells).toEqual([31, 32, 33, 34]);
    expect(postMineJobs(world.engine, 24)).toEqual([]);
  });

  it("posts nothing once the settlement holds enough ore", () => {
    const world = createGatheringWorld();
    world.terrain(31, "iron_ore_deposit");
    world.give(world.chest(8), "iron_ore", world.engine.content.constants.oreLowStock);
    expect(postMineJobs(world.engine, 12)).toEqual([]);
  });
});

describe("postQuarryJobs", () => {
  it("posts stone deposits while limestone is low and not otherwise", () => {
    const world = createGatheringWorld();
    world.terrain(31, "stone_deposit");
    expect(postQuarryJobs(world.engine, 12)).toHaveLength(1);
    expect(activePostingsOfType(world.engine, quarryStoneJobId)).toHaveLength(1);
    const other = createGatheringWorld();
    other.terrain(31, "stone_deposit");
    other.give(other.chest(8), "limestone", other.engine.content.constants.stoneLowStock);
    expect(postQuarryJobs(other.engine, 12)).toEqual([]);
  });
});

describe("registerMiningJobs", () => {
  it("is registered by the engine: registering again is a duplicate", () => {
    expect(() => registerMiningJobs(createGatheringWorld().engine)).toThrow();
  });

  it("mines ore into the worker's inventory, pays XP and wages and uses up a charge", () => {
    const world = createGatheringWorld();
    world.terrain(33, "iron_ore_deposit");
    const miner = world.spawn("peasant", 5);
    world.run(300);
    expect(world.count("iron_ore")).toBeGreaterThanOrEqual(2);
    expect(chargesLeft(world.engine, world.mapId, 33)).toBeLessThan(6);
    expect(skillValueMilli(miner, "mining")).toBeGreaterThan(0);
  });

  it("depletes a deposit for good: the last charge turns the cell into cave floor", () => {
    const world = createGatheringWorld();
    world.terrain(33, "iron_ore_deposit");
    getGatheringService(world.engine).setRemaining(world.mapId, 33, 1);
    world.spawn("peasant", 5);
    world.run(300);
    expect(world.engine.maps.require(world.mapId).terrainAt(33)).toBe("cave_floor");
    expect(chargesLeft(world.engine, world.mapId, 33)).toBe(0);
    const stock = materialStock(world.engine, "iron_ore");
    world.run(300);
    expect(materialStock(world.engine, "iron_ore")).toBe(stock);
  });

  it("quarries limestone and stops at the stock threshold (no flooding)", () => {
    const world = createGatheringWorld();
    for (const cell of [33, 34, 35]) {
      world.terrain(cell, "stone_deposit");
    }
    for (const cell of [5, 6, 7]) {
      world.give(world.spawn("peasant", cell), "bread", 6);
    }
    world.run(1000);
    const limit = world.engine.content.constants.stoneLowStock;
    expect(world.count("limestone")).toBeGreaterThanOrEqual(limit);
    expect(world.count("limestone")).toBeLessThan(limit + 3 * 2 * depositMaxActivePostings);
  });
});

describe("registerDepositJob", () => {
  it("registers one deposit job type once per engine", () => {
    const world = createGatheringWorld();
    expect(() => registerDepositJob(world.engine, "dig.clay", 30, "clay_deposit")).toThrow();
    expect(() => registerDepositJob(world.engine, mineOreJobId, 36, "iron_ore_deposit")).toThrow();
  });
});
