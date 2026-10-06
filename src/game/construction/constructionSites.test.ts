import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { getTotal } from "../inventory/inventoryQueries";
import { findPosting } from "../jobs/jobBoards";
import { PostingStatus } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { findSite, requireSite } from "./buildSiteQueries";
import { ConstructionError, ConstructionErrorKind } from "./ConstructionError";
import {
  buildingIdOf,
  cancelJobTask,
  cancelSite,
  moveSiteToFront,
  queueConstruction,
  queueDeconstruction,
  queueWalls,
  setSitePaused,
  setSitePriority,
  withdrawSiteWork,
} from "./constructionSites";
import { SiteKind, SiteStatus } from "./constructionTypes";
import { createConstructionWorld } from "./testConstructionWorld";

function kindOf(action: () => object): ConstructionErrorKind | null {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof ConstructionError ? error.kind : null;
  }
}

// @covers 016:FR-002 016:FR-003 016:FR-010 016:FR-013 016:FR-014 016:FR-016 016:FR-017
describe("queueConstruction", () => {
  it("places a blueprint with the materials of the definition", () => {
    const world = createConstructionWorld();
    const site = queueConstruction(world.engine, {
      prototypeId: "door",
      mapId: world.mapId,
      cellIndex: 44,
      priority: 70,
      urgent: true,
    });
    expect(site.entity.prototype).toBe("build_site");
    expect(site.data).toMatchObject({
      kind: SiteKind.Construct,
      prototypeId: "door",
      status: SiteStatus.Planned,
      required: [
        { materialId: "oak_plank", quantity: 2 },
        { materialId: "nails", quantity: 2 },
      ],
      priority: 70,
      urgent: true,
      paused: false,
    });
    expect(site.data.ownerFactionId).not.toBeNull();
    expect(getComponent(site.entity, positionComponent)?.cellIndex).toBe(44);
    expect(world.engine.maps.occupants.occupantsOf(world.mapId, 44)).toContain(site.entity.id);
  });

  it("clamps the priority and refuses an invalid placement with the command error", () => {
    const world = createConstructionWorld();
    const high = queueConstruction(world.engine, {
      prototypeId: "chest",
      mapId: world.mapId,
      cellIndex: 44,
      priority: 500,
    });
    expect(high.data.priority).toBe(100);
    const request = { prototypeId: "chest", mapId: world.mapId, cellIndex: 44 };
    expect(kindOf(() => queueConstruction(world.engine, request))).toBe(
      ConstructionErrorKind.LocationAlreadyOccupied,
    );
    expect(kindOf(() => queueConstruction(world.engine, { ...request, cellIndex: 500 }))).toBe(
      ConstructionErrorKind.OutOfBounds,
    );
    expect(kindOf(() => queueConstruction(world.engine, { ...request, prototypeId: "x" }))).toBe(
      ConstructionErrorKind.UnknownPrototype,
    );
  });
});

describe("queueWalls", () => {
  it("queues one job per cell, all or nothing", () => {
    const world = createConstructionWorld();
    world.chest(33);
    expect(kindOf(() => queueWalls(world.engine, "wall", world.mapId, [31, 32, 33]))).toBe(
      ConstructionErrorKind.LocationAlreadyOccupied,
    );
    expect(kindOf(() => queueWalls(world.engine, "wall", world.mapId, [31, 31]))).toBe(
      ConstructionErrorKind.LocationAlreadyOccupied,
    );
    expect(
      world.engine.store.entities().filter((entity) => entity.prototype === "build_site"),
    ).toHaveLength(0);
    const sites = queueWalls(world.engine, "door", world.mapId, [31, 32], 60);
    expect(sites.map((site) => getComponent(site.entity, positionComponent)?.cellIndex)).toEqual([
      31, 32,
    ]);
    expect(
      sites.every((site) => site.data.prototypeId === "door" && site.data.priority === 60),
    ).toBe(true);
  });

  it("only builds walls and doors", () => {
    const world = createConstructionWorld();
    expect(kindOf(() => queueWalls(world.engine, "chest", world.mapId, [31]))).toBe(
      ConstructionErrorKind.UnknownPrototype,
    );
  });
});

describe("buildingIdOf", () => {
  it("names furniture, walls and doors, and nothing else", () => {
    const world = createConstructionWorld();
    expect(buildingIdOf(world.chest(30))).toBe("chest");
    expect(buildingIdOf(world.wall(31))).toBe("wall");
    expect(buildingIdOf(world.door(32))).toBe("door");
    expect(buildingIdOf(world.settler(33))).toBeNull();
  });
});

describe("queueDeconstruction", () => {
  it("places a deconstruction site on the building without materials", () => {
    const world = createConstructionWorld();
    const bench = world.station("workbench", 44);
    const site = queueDeconstruction(world.engine, bench.id, 80);
    expect(site.data).toMatchObject({
      kind: SiteKind.Deconstruct,
      prototypeId: "workbench",
      status: SiteStatus.Building,
      required: [],
      targetEntityId: bench.id,
      priority: 80,
    });
    expect(getComponent(site.entity, positionComponent)?.cellIndex).toBe(44);
  });

  it("refuses unknown entities, non-buildings, unremovable and already ordered ones", () => {
    const world = createConstructionWorld();
    const settler = world.settler(30);
    const chest = world.chest(31);
    expect(kindOf(() => queueDeconstruction(world.engine, 9999))).toBe(
      ConstructionErrorKind.UnknownEntity,
    );
    expect(kindOf(() => queueDeconstruction(world.engine, settler.id))).toBe(
      ConstructionErrorKind.NotRemovable,
    );
    queueDeconstruction(world.engine, chest.id);
    expect(kindOf(() => queueDeconstruction(world.engine, chest.id))).toBe(
      ConstructionErrorKind.LocationAlreadyOccupied,
    );
  });
});

describe("withdrawSiteWork and cancelJobTask", () => {
  it("cancels the posting and forgets the workers", () => {
    const world = createConstructionWorld();
    world.give(world.chest(55), "stone_block", 2);
    const job = world.place("wall", 44);
    world.run(7);
    const site = requireSite(world.engine, job);
    const postingId = site.data.postingId;
    expect(postingId).not.toBeNull();
    withdrawSiteWork(world.engine, site, "test");
    expect(site.data.postingId).toBeNull();
    expect(findPosting(world.engine, postingId ?? 0)).toBeNull();
    expect(cancelJobTask(world.engine, 12345, "build.supply", 1)).toBe(false);
  });
});

describe("cancelSite", () => {
  it("deletes the site, refunds the staged goods and remembers the job", () => {
    const world = createConstructionWorld();
    const chest = world.chest(55);
    const job = world.place("wall", 44);
    const site = requireSite(world.engine, job);
    world.give(site.entity, "stone_block", 1);
    const refunded = cancelSite(world.engine, job);
    expect(refunded).toEqual([{ materialId: "stone_block", quantity: 1 }]);
    expect(getTotal(chest, "stone_block")).toBe(1);
    expect(findSite(world.engine, job)).toBeNull();
    world.run(1);
    expect(world.engine.store.get(job)).toBeUndefined();
    expect(world.built.map((event) => event.name)).toContain("construction.job.cancelled");
    expect(kindOf(() => cancelSite(world.engine, job))).toBe(ConstructionErrorKind.UnknownJob);
  });
});

describe("setSitePaused, setSitePriority and moveSiteToFront", () => {
  it("pauses by withdrawing the open posting", () => {
    const world = createConstructionWorld();
    world.give(world.chest(55), "stone_block", 2);
    const job = world.place("wall", 44);
    world.run(7);
    const postingId = requireSite(world.engine, job).data.postingId ?? 0;
    expect(findPosting(world.engine, postingId)?.posting.status).toBe(PostingStatus.Open);
    setSitePaused(world.engine, job, true);
    expect(requireSite(world.engine, job).data.paused).toBe(true);
    expect(findPosting(world.engine, postingId)).toBeNull();
    setSitePaused(world.engine, job, false);
    expect(requireSite(world.engine, job).data.paused).toBe(false);
    expect(kindOf(() => setSitePaused(world.engine, 9999, true))).toBe(
      ConstructionErrorKind.UnknownJob,
    );
  });

  it("changes priority and urgency, also of the posting", () => {
    const world = createConstructionWorld();
    world.give(world.chest(55), "stone_block", 2);
    const job = world.place("wall", 44);
    world.run(7);
    const postingId = requireSite(world.engine, job).data.postingId ?? 0;
    setSitePriority(world.engine, job, 90, true);
    expect(findPosting(world.engine, postingId)?.posting).toMatchObject({
      priority: 90,
      urgent: true,
    });
    setSitePriority(world.engine, job, -5);
    expect(requireSite(world.engine, job).data).toMatchObject({ priority: 0, urgent: true });
    moveSiteToFront(world.engine, job);
    expect(requireSite(world.engine, job).data).toMatchObject({ priority: 100, urgent: true });
  });
});
