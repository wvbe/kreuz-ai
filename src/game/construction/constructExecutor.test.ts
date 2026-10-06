import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { requireSite } from "./buildSiteQueries";
import { createConstructExecutor, registerConstruct } from "./constructExecutor";
import { cancelSite } from "./constructionSites";
import { SiteStatus } from "./constructionTypes";
import { createConstructionWorld } from "./testConstructionWorld";

function setup() {
  const world = createConstructionWorld();
  const chest = world.chest(55);
  world.give(chest, "stone_block", 2);
  const settler = world.settler(11);
  world.feed([settler]);
  const job = world.place("wall", 44);
  return { world, chest, settler, job };
}

function building(world: ReturnType<typeof createConstructionWorld>, job: number): boolean {
  return world.hasSite(job) && requireSite(world.engine, job).data.startedTick !== null;
}

// @covers 016:FR-007 016:FR-010 016:FR-011 016:FR-012
describe("build.construct", () => {
  it("is registered as a job type executor (registering twice is refused)", () => {
    const { world } = setup();
    expect(() => registerConstruct(world.engine)).toThrow();
    expect(world.engine.taskHandlers.has("build.construct")).toBe(true);
    expect(createConstructExecutor(world.engine).requires).toEqual(["Position"]);
  });

  it("claims, walks to the site, works for the duration and finishes with the event trail", () => {
    const { world, settler, job } = setup();
    world.runUntil(() => building(world, job), 300);
    const site = requireSite(world.engine, job);
    expect(site.data.builderId).toBe(settler.id);
    expect(site.data.status).toBe(SiteStatus.Building);
    expect(site.data.durationTicks).toBe(16);
    world.runUntil(() => !world.hasSite(job), 100);
    const names = world.built.map((event) => event.name);
    expect(names).toEqual([
      "construction.job.queued",
      "construction.job.claimed",
      "construction.job.started",
      "construction.job.completed",
    ]);
    const started = world.built.find((event) => event.name === "construction.job.started");
    const completed = world.built.find((event) => event.name === "construction.job.completed");
    expect((completed?.tick ?? 0) - (started?.tick ?? 0)).toBe(16);
    expect(started?.payload).toEqual({ jobId: job, builderId: settler.id });
  });

  it("puts the site back to nobody-works when the builder task is cancelled", () => {
    const { world, settler, job } = setup();
    world.runUntil(() => building(world, job), 300);
    world.run(3);
    const task = world.engine.tasks
      .getQueue(settler.id)
      ?.tasks.find((candidate) => candidate.type === "build.construct");
    expect(task).toBeDefined();
    const startedBefore = requireSite(world.engine, job).data.startedTick;
    world.engine.tasks.cancel(settler.id, task?.id ?? 0);
    world.run(1);
    const site = requireSite(world.engine, job);
    // The attempt is gone: either nobody works, or a new claim started the phase again.
    expect(site.data.startedTick).not.toBe(startedBefore);
    expect(site.data.progress).toBeLessThan(3);
    // The materials stay and the next claim builds the wall.
    expect(site.data.status).toBe(SiteStatus.Building);
    expect(getTotal(site.entity, "stone_block")).toBe(1);
    world.runUntil(() => !world.hasSite(job), 600);
    expect(world.engine.store.entities().some((entity) => entity.prototype === "wall")).toBe(true);
  });

  it("does nothing when the site is cancelled during the work", () => {
    const { world, job } = setup();
    world.runUntil(() => building(world, job), 300);
    cancelSite(world.engine, job);
    world.run(40);
    expect(world.engine.store.entities().some((entity) => entity.prototype === "wall")).toBe(false);
    expect(world.count("stone_block")).toBe(2);
  });
});
