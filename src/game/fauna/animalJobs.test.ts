import { describe, expect, it } from "vitest";
import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import type { Entity } from "../ecs/Entity";
import { getComponent } from "../ecs/Entity";
import { getTotal } from "../inventory/inventoryQueries";
import { jobBoardComponent } from "../jobs/jobBoardComponent";
import { findPosting } from "../jobs/jobBoards";
import { registerJobType } from "../jobs/jobExecutor";
import { postJob } from "../jobs/jobPostings";
import { PostingStatus } from "../jobs/jobTypes";
import { createJobWorld, noAiOverride } from "../jobs/testJobWorld";
import type { JobTestWorld } from "../jobs/testJobWorld";
import { animalComponent } from "./animalComponent";
import {
  animalWorkBaseTicks,
  butcherAnimalJobId,
  collectAnimalProducts,
  createAnimalJobExecutor,
  registerAnimalJobs,
  huntGameJobId,
  maxChaseLegs,
  tendAnimalsJobId,
} from "./animalJobs";

function post(world: JobTestWorld, jobTypeId: string, animal: Entity): number {
  const position = animal.components["Position"] as { cellIndex: number };
  return postJob(
    world.engine,
    world.boardId,
    {
      jobTypeId,
      target: {
        mapId: world.mapId,
        cellIndex: position.cellIndex,
        entityId: animal.id,
        materialId: null,
      },
    },
    world.engine.time.tickCount,
  ).id;
}

function statusOf(world: JobTestWorld, postingId: number): PostingStatus | undefined {
  const active = findPosting(world.engine, postingId);
  if (active !== null) {
    return active.posting.status;
  }
  const board = getComponent(world.engine.store.require(world.boardId), jobBoardComponent);
  return board?.history.find((posting) => posting.id === postingId)?.status;
}

function holdProducts(animal: Entity, materialId: string, quantity: number): void {
  const inventory = animal.components["Inventory"] as {
    slots: { materialId: string; quantity: number; remainingMilli: null; decayRateMilli: null }[];
  };
  inventory.slots.push({ materialId, quantity, remainingMilli: null, decayRateMilli: null });
}

describe("animal jobs", () => {
  it("lets a settler butcher a cow: meat in its inventory, the cow gone, the posting done", () => {
    const world = createJobWorld();
    const cow = world.spawn("cow", 55, noAiOverride);
    const settler = world.spawn("peasant", 12);
    const id = post(world, butcherAnimalJobId, cow);
    world.run(300);
    expect(statusOf(world, id)).toBe(PostingStatus.Done);
    expect(world.engine.store.get(cow.id)).toBeUndefined();
    expect(getTotal(settler, "raw_meat")).toBe(8);
  });

  it("also hands over what the cow held (milk) when it is butchered", () => {
    const world = createJobWorld();
    const cow = world.spawn("cow", 55, noAiOverride);
    holdProducts(cow, "milk", 3);
    const settler = world.spawn("peasant", 12);
    post(world, butcherAnimalJobId, cow);
    world.run(300);
    expect(getTotal(settler, "milk")).toBe(3);
    expect(getTotal(settler, "raw_meat")).toBe(8);
  });

  it("lets a settler tend livestock: it takes the wool and the sheep lives on", () => {
    const world = createJobWorld();
    const sheep = world.spawn("sheep", 55, noAiOverride);
    holdProducts(sheep, "raw_wool", 2);
    const settler = world.spawn("peasant", 12);
    const id = post(world, tendAnimalsJobId, sheep);
    world.run(300);
    expect(statusOf(world, id)).toBe(PostingStatus.Done);
    expect(getTotal(settler, "raw_wool")).toBe(2);
    expect(getTotal(sheep, "raw_wool")).toBe(0);
    expect(world.engine.store.get(sheep.id)).toBeDefined();
  });

  it("fails tending when the animal holds nothing", () => {
    const world = createJobWorld();
    const sheep = world.spawn("sheep", 55, noAiOverride);
    const settler = world.spawn("peasant", 12);
    const id = post(world, tendAnimalsJobId, sheep);
    world.run(300);
    expect(statusOf(world, id)).not.toBe(PostingStatus.Done);
    expect(getTotal(settler, "raw_wool")).toBe(0);
  });

  it("refuses to butcher wild animals and to hunt livestock", () => {
    const world = createJobWorld();
    const deer = world.spawn("deer", 55, noAiOverride);
    const sheep = world.spawn("sheep", 56, noAiOverride);
    world.spawn("peasant", 12);
    const butcher = post(world, butcherAnimalJobId, deer);
    const hunt = post(world, huntGameJobId, sheep);
    world.run(400);
    expect(statusOf(world, butcher)).not.toBe(PostingStatus.Done);
    expect(statusOf(world, hunt)).not.toBe(PostingStatus.Done);
    expect(world.engine.store.get(deer.id)).toBeDefined();
    expect(world.engine.store.get(sheep.id)).toBeDefined();
  });

  it("lets a settler hunt a deer that runs away: it catches it and takes meat and hide", () => {
    const world = createJobWorld();
    const deer = world.spawn("deer", 58);
    const settler = world.spawn("peasant", 12);
    const id = post(world, huntGameJobId, deer);
    world.run(600);
    expect(statusOf(world, id)).toBe(PostingStatus.Done);
    expect(world.engine.store.get(deer.id)).toBeUndefined();
    expect(getTotal(settler, "raw_meat")).toBe(6);
    expect(getTotal(settler, "raw_hide")).toBe(2);
  });

  it("fails a posting whose animal is already gone", () => {
    const world = createJobWorld();
    const deer = world.spawn("deer", 55, noAiOverride);
    world.spawn("peasant", 12);
    const id = post(world, huntGameJobId, deer);
    world.engine.store.requestDelete(deer.id);
    world.run(100);
    expect(statusOf(world, id)).not.toBe(PostingStatus.Done);
  });

  it("moves what an animal holds into the worker's inventory as far as it fits", () => {
    const world = createJobWorld();
    const cow = world.spawn("cow", 5, noAiOverride);
    const worker = world.spawn("peasant", 6, noAiOverride);
    holdProducts(cow, "milk", 3);
    holdProducts(cow, "eggs", 2);
    expect(collectAnimalProducts(world.engine, worker, cow)).toEqual([
      { materialId: "eggs", quantity: 2 },
      { materialId: "milk", quantity: 3 },
    ]);
    expect(getTotal(cow, "milk")).toBe(0);
    expect(getTotal(worker, "milk")).toBe(3);
    expect(getComponent(cow, animalComponent)?.prototypeId).toBe("cow");
  });

  it("names the limits of a chase", () => {
    expect(maxChaseLegs).toBeGreaterThan(3);
    expect(animalWorkBaseTicks).toBeGreaterThan(0);
  });

  it("is registered by the engine already (a second registration is a duplicate)", () => {
    const world = createJobWorld();
    expect(() => registerAnimalJobs(world.engine)).toThrow();
  });

  it("builds an executor for any effect: the worker chases the animal, the effect runs once", () => {
    const jobs = bundledContentFiles[ContentFile.Jobs];
    const content = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.Jobs]: [
        ...(Array.isArray(jobs) ? jobs : []),
        { id: "test.animal", name: "Test", zoneContext: { kind: "any" }, recurrence: "one-time" },
      ],
    });
    const world = createJobWorld({ content });
    const touched: number[] = [];
    registerJobType(
      world.engine,
      "test.animal",
      createAnimalJobExecutor(world.engine, {
        complete: (_engine, _context, animal) => {
          touched.push(animal.id);
          return [{ materialId: "raw_meat", quantity: 1 }];
        },
      }),
    );
    const horse = world.spawn("horse", 55, noAiOverride);
    world.spawn("peasant", 12);
    const id = post(world, "test.animal", horse);
    world.run(300);
    expect(statusOf(world, id)).toBe(PostingStatus.Done);
    expect(touched).toEqual([horse.id]);
    expect(world.engine.store.get(horse.id)).toBeDefined();
  });
});
