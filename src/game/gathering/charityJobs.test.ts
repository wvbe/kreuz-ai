import { describe, expect, it } from "vitest";
import { needsComponent } from "../ai/needs/needsComponent";
import { KnownNeed } from "../ai/aiTypes";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { retrieve } from "../inventory/inventoryOperations";
import { getTotal } from "../inventory/inventoryQueries";
import { noAiOverride } from "../jobs/testJobWorld";
import { activePostingsOfType } from "../jobs/jobBoards";
import { isNeedy, postCharityJobs, registerCharityJobs } from "./charityJobs";
import { charityDistributeJobId } from "./gatheringTypes";
import { contentWithConstants, createGatheringWorld } from "./testGatheringWorld";

function charityWorld() {
  return createGatheringWorld({ content: contentWithConstants({ charityHungerBelow: 25 }) });
}

function hungryWithoutBread(world: ReturnType<typeof createGatheringWorld>, cell: number): Entity {
  const entity = world.spawn("peasant", cell, noAiOverride);
  retrieve({ materials: world.engine.materials, actor: null }, entity, "bread", 2);
  setHunger(entity, 10);
  return entity;
}

function setHunger(entity: Entity, percent: number): void {
  const hunger = getComponent(entity, needsComponent)?.values.find(
    (value) => value.needId === KnownNeed.Hunger,
  );
  if (hunger !== undefined) {
    hunger.valueMilli = percent * 1000;
  }
}

describe("isNeedy", () => {
  it("is never true while charityHungerBelow is 0 (the shipped pack)", () => {
    const world = createGatheringWorld();
    const citizen = world.spawn("peasant", 5);
    retrieve({ materials: world.engine.materials, actor: null }, citizen, "bread", 2);
    setHunger(citizen, 0);
    expect(isNeedy(world.engine, citizen)).toBe(false);
  });

  it("is a hungry citizen without bread", () => {
    const world = charityWorld();
    const citizen = world.spawn("peasant", 5);
    expect(isNeedy(world.engine, citizen)).toBe(false);
    setHunger(citizen, 10);
    expect(isNeedy(world.engine, citizen)).toBe(false);
    retrieve({ materials: world.engine.materials, actor: null }, citizen, "bread", 2);
    expect(isNeedy(world.engine, citizen)).toBe(true);
    world.give(citizen, "bread", 1);
    expect(isNeedy(world.engine, citizen)).toBe(false);
    expect(isNeedy(world.engine, world.chest(8))).toBe(false);
  });
});

describe("postCharityJobs", () => {
  it("posts for a needy citizen only while a stockpile holds bread, once per citizen", () => {
    const world = charityWorld();
    const citizen = hungryWithoutBread(world, 5);
    expect(postCharityJobs(world.engine, 12)).toEqual([]);
    world.give(world.chest(8), "bread", 4);
    expect(postCharityJobs(world.engine, 5)).toEqual([]);
    expect(postCharityJobs(world.engine, 12)).toHaveLength(1);
    expect(activePostingsOfType(world.engine, charityDistributeJobId)[0]?.target).toMatchObject({
      entityId: citizen.id,
      cellIndex: 5,
      materialId: "bread",
    });
    expect(postCharityJobs(world.engine, 24)).toEqual([]);
  });
});

describe("registerCharityJobs", () => {
  it("is registered by the engine: registering again is a duplicate", () => {
    expect(() => registerCharityJobs(createGatheringWorld().engine)).toThrow();
  });

  it("walks bread from the stockpile to the hungry citizen", () => {
    const world = charityWorld();
    const needy = hungryWithoutBread(world, 5);
    const chest = world.chest(8);
    world.give(chest, "bread", 4);
    world.spawn("peasant", 6);
    world.run(60);
    expect(getTotal(needy, "bread")).toBeGreaterThanOrEqual(1);
    expect(getTotal(chest, "bread") + getTotal(needy, "bread")).toBeLessThanOrEqual(4);
  });
});
