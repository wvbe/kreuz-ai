import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { getAllItems, getTotal } from "../inventory/inventoryQueries";
import { requireSite } from "./buildSiteQueries";
import { createConstructionWorld } from "./testConstructionWorld";
import { destroySite, dropLoosePile, refundSite, spawnLoosePile } from "./siteRefund";

function piles(world: ReturnType<typeof createConstructionWorld>) {
  return world.engine.store.entities().filter((entity) => entity.prototype === "loose_pile");
}

// @covers 016:FR-005 016:FR-014 016:SC-008
describe("spawnLoosePile and dropLoosePile", () => {
  it("spawns an empty pile on a cell and fills a pile with dropped goods", () => {
    const world = createConstructionWorld();
    const empty = spawnLoosePile(world.engine, world.mapId, 30);
    expect(getAllItems(empty)).toEqual([]);
    expect(world.engine.maps.occupants.occupantsOf(world.mapId, 30)).toContain(empty.id);
    expect(dropLoosePile(world.engine, world.mapId, 31, [])).toBeNull();
    const id = dropLoosePile(world.engine, world.mapId, 31, [
      { materialId: "stone_block", quantity: 3 },
    ]);
    expect(getTotal(world.engine.store.require(id ?? 0), "stone_block")).toBe(3);
  });
});

describe("refundSite", () => {
  it("moves staged goods to the best storage", () => {
    const world = createConstructionWorld();
    const chest = world.chest(55);
    const job = world.place("wall", 44);
    const site = requireSite(world.engine, job);
    world.give(site.entity, "stone_block", 2);
    expect(refundSite(world.engine, site.entity)).toEqual([
      { materialId: "stone_block", quantity: 2 },
    ]);
    expect(getTotal(site.entity, "stone_block")).toBe(0);
    expect(getTotal(chest, "stone_block")).toBe(2);
    expect(piles(world)).toHaveLength(0);
  });

  it("drops what no storage takes as a loose pile on the site cell", () => {
    const world = createConstructionWorld();
    const job = world.place("wall", 44);
    const site = requireSite(world.engine, job);
    world.give(site.entity, "stone_block", 2);
    refundSite(world.engine, site.entity);
    const [pile] = piles(world);
    expect(getTotal(pile ?? site.entity, "stone_block")).toBe(2);
    expect(world.count("stone_block")).toBe(2);
    expect(getComponent(pile ?? site.entity, inventoryComponent)).toBeDefined();
  });

  it("gives back nothing for an empty site", () => {
    const world = createConstructionWorld();
    const site = requireSite(world.engine, world.place("wall", 44));
    expect(refundSite(world.engine, site.entity)).toEqual([]);
    expect(piles(world)).toHaveLength(0);
  });
});

describe("destroySite", () => {
  it("refunds a site that is deleted and ignores other entities", () => {
    const world = createConstructionWorld();
    const chest = world.chest(55);
    const site = requireSite(world.engine, world.place("wall", 44));
    world.give(site.entity, "stone_block", 2);
    expect(destroySite(world.engine, chest)).toEqual([]);
    world.engine.store.requestDelete(site.entity.id);
    world.run(1);
    expect(world.engine.store.get(site.entity.id)).toBeUndefined();
    expect(world.count("stone_block")).toBe(2);
    expect(getTotal(chest, "stone_block")).toBe(2);
  });
});
