import { describe, expect, it } from "vitest";
import { getJobService } from "../jobs/jobServiceRegistry";
import { requireSite } from "./buildSiteQueries";
import { ConstructionBlockedKind } from "./constructionTypes";
import { siteBlockers } from "./siteBlockers";
import { createConstructionWorld } from "./testConstructionWorld";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";

describe("siteBlockers", () => {
  it("reports a missing material nobody can supply", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const site = requireSite(world.engine, world.place("door", 44));
    world.give(site.entity, "oak_plank", 1);
    expect(siteBlockers(world.engine, site)).toEqual([
      {
        kind: ConstructionBlockedKind.MissingInput,
        params: { materialId: "oak_plank", required: 2, delivered: 1, available: 0 },
      },
      {
        kind: ConstructionBlockedKind.MissingInput,
        params: { materialId: "nails", required: 2, delivered: 0, available: 0 },
      },
    ]);
  });

  it("reports nothing while storage can supply the lack or a supplier is on the way", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const chest = world.chest(55);
    world.give(chest, "stone_block", 2);
    const site = requireSite(world.engine, world.place("wall", 44));
    expect(siteBlockers(world.engine, site)).toEqual([]);
    const other = requireSite(world.engine, world.place("wall", 45));
    other.data.supplierId = 99;
    expect(siteBlockers(world.engine, other)).toEqual([]);
  });

  it("reports a pause and a tier the settlement fell below", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const site = requireSite(world.engine, world.place("oven", 44));
    site.data.paused = true;
    site.data.supplierId = 99;
    getJobService(world.engine).setTierSource(() => "hamlet");
    expect(siteBlockers(world.engine, site).map((reason) => reason.kind)).toEqual([
      ConstructionBlockedKind.LockedByTier,
      ConstructionBlockedKind.Paused,
    ]);
  });
});
