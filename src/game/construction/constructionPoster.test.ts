import { describe, expect, it } from "vitest";
import { findPosting } from "../jobs/jobBoards";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { requireSite } from "./buildSiteQueries";
import { postSiteJobs, refreshSiteStatus, sweepSites } from "./constructionPoster";
import { SiteStatus } from "./constructionTypes";
import { createConstructionWorld } from "./testConstructionWorld";

function setup() {
  const world = createConstructionWorld();
  const chest = world.chest(55);
  world.give(chest, "stone_block", 4);
  return { world, chest };
}

// @covers 016:FR-001 016:FR-001b 016:FR-004 016:FR-010 016:FR-012 016:FR-013 016:FR-014
describe("refreshSiteStatus", () => {
  it("derives planned, supplying and building from the delivered materials", () => {
    const { world } = setup();
    // An oven needs six stone blocks: nothing, some, all.
    const site = requireSite(world.engine, world.place("oven", 44));
    expect(refreshSiteStatus(site)).toBe(SiteStatus.Planned);
    world.give(site.entity, "stone_block", 1);
    expect(refreshSiteStatus(site)).toBe(SiteStatus.Supplying);
    world.give(site.entity, "stone_block", 5);
    expect(refreshSiteStatus(site)).toBe(SiteStatus.Building);
    const down = world.command("QueueDeconstruction", {
      targetEntityId: world.chest(30).id,
    }) as { jobId: number };
    expect(refreshSiteStatus(requireSite(world.engine, down.jobId))).toBe(SiteStatus.Building);
  });

  it("calls a site with a supplier or posting on the way supplying", () => {
    const { world } = setup();
    const site = requireSite(world.engine, world.place("wall", 44));
    site.data.supplierId = 5;
    expect(refreshSiteStatus(site)).toBe(SiteStatus.Supplying);
  });
});

describe("postSiteJobs", () => {
  it("posts a supply job for a site that lacks materials, every 6 ticks only", () => {
    const { world } = setup();
    const job = world.place("wall", 44);
    expect(postSiteJobs(world.engine, 5)).toEqual([]);
    const created = postSiteJobs(world.engine, 6);
    expect(created).toHaveLength(1);
    const posting = findPosting(world.engine, created[0] ?? 0)?.posting;
    expect(posting).toMatchObject({
      jobTypeId: "build.supply",
      target: { entityId: job, cellIndex: 44, materialId: "stone_block" },
      priority: 50,
      urgent: false,
    });
    expect(requireSite(world.engine, job).data.postingId).toBe(created[0]);
    // One posting per site: nothing new while it is out.
    expect(postSiteJobs(world.engine, 12)).toEqual([]);
  });

  it("posts the construct job once everything is delivered and carries the site priority", () => {
    const { world } = setup();
    const job = world.place("wall", 44, { priority: 80, urgent: true });
    const site = requireSite(world.engine, job);
    world.give(site.entity, "stone_block", 2);
    const [id] = postSiteJobs(world.engine, 6);
    expect(findPosting(world.engine, id ?? 0)?.posting).toMatchObject({
      jobTypeId: "build.construct",
      priority: 80,
      urgent: true,
    });
    expect(site.data.status).toBe(SiteStatus.Building);
  });

  it("skips paused jobs and forgets a posting that vanished", () => {
    const { world } = setup();
    const job = world.place("wall", 44);
    const site = requireSite(world.engine, job);
    site.data.paused = true;
    expect(postSiteJobs(world.engine, 6)).toEqual([]);
    site.data.paused = false;
    site.data.postingId = 4242;
    expect(postSiteJobs(world.engine, 12)).toHaveLength(1);
    expect(site.data.postingId).not.toBe(4242);
  });

  it("suspends a site without a source and resumes it when one appears", () => {
    const world = createConstructionWorld();
    const job = world.place("wall", 44);
    postSiteJobs(world.engine, 6);
    expect(requireSite(world.engine, job).data.blockedMaterialId).toBe("stone_block");
    postSiteJobs(world.engine, 12);
    world.run(1);
    expect(world.built.filter((event) => event.name === "construction.job.suspended")).toHaveLength(
      1,
    );
    world.give(world.chest(55), "stone_block", 2);
    postSiteJobs(world.engine, 18);
    world.run(1);
    expect(requireSite(world.engine, job).data.blockedMaterialId).toBeNull();
    expect(world.built.filter((event) => event.name === "construction.job.resumed")).toHaveLength(
      1,
    );
  });

  it("posts nothing without a board", () => {
    const { world } = setup();
    world.engine.store.requestDelete(world.boardId);
    world.run(1);
    world.place("wall", 44);
    expect(postSiteJobs(world.engine, 6)).toEqual([]);
  });
});

describe("sweepSites", () => {
  it("releases supply reservations whose holder has no supply task", () => {
    const { world, chest } = setup();
    const settler = world.settler(11);
    const reservation = getStorageService(world.engine).reservations.reserve({
      kind: ReservationKind.Supply,
      holderId: settler.id,
      inventoryOwnerId: chest.id,
      materialId: "stone_block",
      quantity: 1,
    });
    sweepSites(world.engine, 1);
    expect(getStorageService(world.engine).reservations.get(reservation.id)).toBeNull();
  });

  it("frees a builder that vanished and a supplier that has no task", () => {
    const { world } = setup();
    const site = requireSite(world.engine, world.place("wall", 44));
    world.give(site.entity, "stone_block", 2);
    site.data.status = SiteStatus.Building;
    site.data.builderId = 99999;
    site.data.startedTick = 3;
    site.data.durationTicks = 10;
    site.data.progress = 4;
    site.data.supplierId = 99998;
    sweepSites(world.engine, 1);
    expect(site.data).toMatchObject({
      builderId: null,
      startedTick: null,
      progress: 0,
      durationTicks: 0,
      supplierId: null,
    });
  });

  it("cancels jobs whose cell was taken, at the poster interval", () => {
    const { world } = setup();
    const job = world.place("wall", 44);
    world.engine.maps.require(world.mapId).setTerrain(44, "water_shallow");
    expect(sweepSites(world.engine, 5)).toBe(0);
    expect(sweepSites(world.engine, 6)).toBe(1);
    expect(world.hasSite(job)).toBe(false);
  });
});
