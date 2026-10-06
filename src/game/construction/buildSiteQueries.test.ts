import { describe, expect, it } from "vitest";
import {
  deliveredOf,
  findSite,
  listSites,
  missingMaterials,
  requireSite,
  siteAt,
  siteCell,
  siteTargeting,
  siteWorkCell,
} from "./buildSiteQueries";
import { BlockReason } from "../map/mapTypes";
import { ConstructionError, ConstructionErrorKind } from "./ConstructionError";
import { createConstructionWorld } from "./testConstructionWorld";

function setup() {
  const world = createConstructionWorld();
  const wallJob = world.place("wall", 44);
  const doorJob = world.place("door", 45);
  return { world, wallJob, doorJob };
}

// @covers 016:FR-005
describe("listSites, findSite and requireSite", () => {
  it("lists live sites ascending and leaves out sites flagged for deletion", () => {
    const { world, wallJob, doorJob } = setup();
    expect(listSites(world.engine).map((site) => site.entity.id)).toEqual([wallJob, doorJob]);
    world.engine.store.requestDelete(wallJob);
    expect(listSites(world.engine).map((site) => site.entity.id)).toEqual([doorJob]);
    expect(findSite(world.engine, wallJob)).toBeNull();
    expect(findSite(world.engine, doorJob)?.data.prototypeId).toBe("door");
  });

  it("throws UnknownJob for a missing job and for an entity that is no site", () => {
    const { world } = setup();
    const chest = world.chest(60);
    for (const id of [9999, chest.id]) {
      try {
        requireSite(world.engine, id);
        throw new Error("expected a throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ConstructionError);
        expect((error as ConstructionError).kind).toBe(ConstructionErrorKind.UnknownJob);
      }
    }
  });
});

describe("siteAt and siteCell", () => {
  it("finds the site on a cell and reports the cell of a site", () => {
    const { world, wallJob } = setup();
    expect(siteAt(world.engine, world.mapId, 44)?.entity.id).toBe(wallJob);
    expect(siteAt(world.engine, world.mapId, 46)).toBeNull();
    const site = requireSite(world.engine, wallJob);
    expect(siteCell(site)).toEqual({ mapId: world.mapId, cellIndex: 44 });
  });
});

describe("siteTargeting", () => {
  it("finds the deconstruction that targets an entity", () => {
    const { world } = setup();
    const wall = world.wall(30);
    expect(siteTargeting(world.engine, wall.id)).toBeNull();
    const result = world.command("QueueDeconstruction", { targetEntityId: wall.id }) as {
      jobId: number;
    };
    expect(siteTargeting(world.engine, wall.id)?.entity.id).toBe(result.jobId);
  });
});

describe("deliveredOf and missingMaterials", () => {
  it("compares the staged inventory with the requirement list", () => {
    const { world } = setup();
    const door = world.place("door", 46);
    const site = requireSite(world.engine, door);
    expect(missingMaterials(site)).toEqual([
      { materialId: "oak_plank", quantity: 2 },
      { materialId: "nails", quantity: 2 },
    ]);
    world.give(site.entity, "oak_plank", 3);
    world.give(site.entity, "nails", 1);
    expect(deliveredOf(site)).toEqual([
      { materialId: "oak_plank", quantity: 2 },
      { materialId: "nails", quantity: 1 },
    ]);
    expect(missingMaterials(site)).toEqual([{ materialId: "nails", quantity: 1 }]);
    world.give(site.entity, "nails", 1);
    expect(missingMaterials(site)).toEqual([]);
  });
});

describe("siteWorkCell", () => {
  it("is the site cell, or a traversable neighbour when the cell is blocked", () => {
    const { world, wallJob } = setup();
    const site = requireSite(world.engine, wallJob);
    expect(siteWorkCell(world.engine, site)).toEqual({ mapId: world.mapId, cellIndex: 44 });
    const wall = world.wall(30);
    const down = world.command("QueueDeconstruction", { targetEntityId: wall.id }) as {
      jobId: number;
    };
    world.engine.maps.require(world.mapId).setObstruction(30, BlockReason.Wall);
    const work = siteWorkCell(world.engine, requireSite(world.engine, down.jobId));
    expect(work?.cellIndex).not.toBe(30);
    expect(world.engine.maps.require(world.mapId).neighbors(30)).toContain(work?.cellIndex);
  });
});
