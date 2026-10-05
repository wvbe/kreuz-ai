import { describe, expect, it } from "vitest";
import { getTotal } from "../inventory/inventoryQueries";
import { BlockReason } from "../map/mapTypes";
import { findSite, requireSite } from "./buildSiteQueries";
import { SiteKind } from "./constructionTypes";
import { completeSite, isSiteLost, placementBlockers } from "./siteCompletion";
import { createConstructionWorld } from "./testConstructionWorld";

function ready(prototypeId: string, cell: number) {
  const world = createConstructionWorld();
  const job = world.place(prototypeId, cell);
  const site = requireSite(world.engine, job);
  for (const item of site.data.required) {
    world.give(site.entity, item.materialId, item.quantity);
  }
  return { world, job, site };
}

describe("completeSite", () => {
  it("places the building, consumes the materials and queues the completion", () => {
    const { world, job } = ready("wall", 44);
    world.give(requireSite(world.engine, job).entity, "stone_block", 1);
    expect(completeSite(world.engine, job)).toBe(true);
    expect(findSite(world.engine, job)).toBeNull();
    const wall = world.engine.store.entities().find((entity) => entity.prototype === "wall");
    expect(wall).toBeDefined();
    expect(world.engine.maps.require(world.mapId).blockReason(44)).toBe(BlockReason.Wall);
    // The surplus unit went back like a refund (here: a pile, there is no storage).
    expect(world.count("stone_block")).toBe(1);
    world.run(1);
    const done = world.built.find((event) => event.name === "construction.job.completed");
    expect(done?.payload).toMatchObject({
      jobId: job,
      kind: SiteKind.Construct,
      entityId: wall?.id,
      consumed: [{ materialId: "stone_block", quantity: 2 }],
    });
  });

  it("builds workstations by prototype and furniture by the placeholder", () => {
    const oven = ready("oven", 44);
    expect(completeSite(oven.world.engine, oven.job)).toBe(true);
    expect(
      oven.world.engine.store.entities().filter((entity) => entity.prototype === "oven"),
    ).toHaveLength(1);
    const bed = ready("wooden_bed", 44);
    expect(completeSite(bed.world.engine, bed.job)).toBe(true);
    expect(
      bed.world.engine.store.entities().find((entity) => entity.prototype === "furniture_piece")
        ?.components["Furniture"],
    ).toEqual({ furnitureId: "wooden_bed" });
  });

  it("does not finish a site that lacks materials or is gone", () => {
    const world = createConstructionWorld();
    const job = world.place("wall", 44);
    expect(completeSite(world.engine, job)).toBe(false);
    expect(completeSite(world.engine, 9999)).toBe(false);
    expect(findSite(world.engine, job)).not.toBeNull();
  });

  it("builds nothing when the cell was taken meanwhile", () => {
    const { world, job } = ready("wall", 44);
    world.chest(44);
    expect(completeSite(world.engine, job)).toBe(false);
    expect(world.engine.store.entities().some((entity) => entity.prototype === "wall")).toBe(false);
  });

  it("takes a building down: deletes it and drops the yield", () => {
    const world = createConstructionWorld();
    const bench = world.station("workbench", 44);
    const down = world.command("QueueDeconstruction", { targetEntityId: bench.id }) as {
      jobId: number;
    };
    expect(completeSite(world.engine, down.jobId)).toBe(true);
    expect(world.engine.store.isPendingDelete(bench.id)).toBe(true);
    const pile = world.engine.store.entities().find((entity) => entity.prototype === "loose_pile");
    expect(pile === undefined ? 0 : getTotal(pile, "oak_plank")).toBe(2);
    world.run(1);
    expect(world.engine.store.get(bench.id)).toBeUndefined();
    const done = world.built.find((event) => event.name === "construction.job.completed");
    expect(done?.payload).toMatchObject({
      kind: SiteKind.Deconstruct,
      consumed: [],
      yield: [{ materialId: "oak_plank", quantity: 2 }],
      entityId: null,
    });
  });

  it("frees the cell of a wall that is taken down at once", () => {
    const world = createConstructionWorld();
    const wall = world.wall(44);
    world.engine.maps.require(world.mapId).setObstruction(44, BlockReason.Wall);
    const down = world.command("QueueDeconstruction", { targetEntityId: wall.id }) as {
      jobId: number;
    };
    expect(completeSite(world.engine, down.jobId)).toBe(true);
    expect(world.engine.maps.require(world.mapId).isTraversable(44)).toBe(true);
  });
});

describe("placementBlockers and isSiteLost", () => {
  it("only blocks a construction when the cell or terrain changed", () => {
    const { world, site } = ready("wall", 44);
    expect(placementBlockers(world.engine, site)).toEqual([]);
    expect(isSiteLost(world.engine, site)).toBe(false);
    world.engine.maps.require(world.mapId).setTerrain(44, "water_shallow");
    expect(placementBlockers(world.engine, site)).toHaveLength(1);
    expect(isSiteLost(world.engine, site)).toBe(true);
  });

  it("loses a deconstruction when its target vanished", () => {
    const world = createConstructionWorld();
    const chest = world.chest(44);
    const down = world.command("QueueDeconstruction", { targetEntityId: chest.id }) as {
      jobId: number;
    };
    const site = requireSite(world.engine, down.jobId);
    expect(placementBlockers(world.engine, site)).toEqual([]);
    expect(isSiteLost(world.engine, site)).toBe(false);
    world.engine.store.requestDelete(chest.id);
    expect(isSiteLost(world.engine, site)).toBe(true);
  });
});
