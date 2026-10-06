import { describe, expect, it } from "vitest";
import {
  DeferralReason,
  deferredJobReasons,
  deferredJobTypeIds,
  findUnhandledJobTypes,
} from "./jobCoverage";
import { createJobWorld } from "./testJobWorld";

describe("findUnhandledJobTypes", () => {
  it("finds nothing: every job type on the boards has an executor or is deferred", () => {
    const world = createJobWorld();
    expect(findUnhandledJobTypes(world.engine)).toEqual([]);
  });

  it("deferred types have no executor and are real content", () => {
    const world = createJobWorld();
    for (const id of deferredJobTypeIds) {
      expect(world.engine.content.jobs.has(id)).toBe(true);
      expect(world.engine.taskHandlers.has(id)).toBe(false);
    }
  });

  it("reports exactly the deferred types when nothing is deferred", () => {
    const world = createJobWorld();
    expect(findUnhandledJobTypes(world.engine, [])).toEqual([...deferredJobTypeIds]);
  });

  it("has an executor for every gathering, fishing, crop and charity job of the pack", () => {
    const world = createJobWorld();
    for (const id of [
      "farm.sow",
      "farm.harvest",
      "fell.trees",
      "fell.pine",
      "fell.birch",
      "mine.ore",
      "mine.vein",
      "quarry.stone",
      "quarry.granite",
      "dig.clay",
      "gather.sand",
      "gather.herbs",
      "gather.fruit",
      "gather.grapes",
      "fish.catch",
      "charity.distribute",
    ]) {
      expect(world.engine.taskHandlers.has(id), id).toBe(true);
    }
  });

  it("names the animal jobs for the animals task and gives every deferral a reason", () => {
    for (const id of ["tend.animals", "tend.bees", "hunt.game", "butcher.animal"]) {
      expect(deferredJobReasons[id]).toBe(DeferralReason.NeedsAnimals);
    }
    expect(Object.keys(deferredJobReasons)).toEqual([...deferredJobTypeIds]);
  });

  it("holds the 23 spec job types, every one posted, deferred or served elsewhere", () => {
    const world = createJobWorld();
    const spec = [
      "farm.sow",
      "farm.tend",
      "farm.harvest",
      "mine.ore",
      "quarry.stone",
      "fell.trees",
      "fish.catch",
      "gather.herbs",
      "tend.animals",
      "tend.bees",
      "craft.produce",
      "haul.deliver",
      "build.construct",
      "build.deconstruct",
      "guard.patrol",
      "guard.watch",
      "trade.sell",
      "trade.buy",
      "preach.sermon",
      "preach.pray",
      "diplomacy.dispatch",
      "haul.bury",
      "govern.steward_audience",
    ];
    expect(spec).toHaveLength(23);
    for (const id of spec) {
      const job = world.engine.content.jobs.find(id);
      expect(job, id).toBeDefined();
      const covered =
        job?.onBoard === false ||
        deferredJobTypeIds.includes(id) ||
        world.engine.taskHandlers.has(id);
      expect(covered, id).toBe(true);
    }
  });
});
