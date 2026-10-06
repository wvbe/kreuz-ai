import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startingStockpileKit } from "../worldgen/spawnSettlers";
import { validateTierReachability } from "../settlement/validateTierReachability";
import { tierRank } from "../settlement/tierOrder";
import { loadContent } from "./ContentLoader";
import { FurnitureRefKind, SettlementTier } from "./contentTypes";

const specRecipes = 59;
const specZones = 39;

/** The known source gaps of `docs/content-crossrefs-5.4.md` (`- gap: <materialId>` lines). */
const knownGaps = new Set(
  readFileSync(new URL("../../../docs/content-crossrefs-5.4.md", import.meta.url), "utf8")
    .split("\n")
    .map((line) => /^- gap: (\w+)/.exec(line)?.[1])
    .filter((id): id is string => id !== undefined),
);

describe("content conformance against spec 022 (task 5.4a, D-120)", () => {
  const content = loadContent();
  const tierOf = (tier: string | undefined): number => tierRank(tier ?? SettlementTier.Hamlet);

  it("holds at least the spec's recipes and zone types", () => {
    expect(content.recipes.ids().length).toBeGreaterThanOrEqual(specRecipes);
    expect(content.zones.ids().length).toBeGreaterThanOrEqual(specZones);
  });

  it("gives the open-air and production zone types their activity unlock", () => {
    for (const id of ["carpentry", "farm_field", "orchard", "herb_garden", "vineyard", "quarry"]) {
      expect(content.zones.require(id).activityUnlocks.length).toBeGreaterThan(0);
    }
  });

  it("has no two zone types with an identical requirement set (dwelling shares the bed rule by design)", () => {
    const seen = new Map<string, string>();
    for (const zone of content.zones.all()) {
      if (zone.id === "dwelling") {
        continue;
      }
      const key = JSON.stringify([
        zone.requiresRoom,
        zone.minTiles,
        zone.furnitureRequirements,
        zone.requiresJobBoard,
        zone.effects,
        zone.activityUnlocks,
      ]);
      expect(seen.get(key), `${zone.id} repeats ${seen.get(key)}`).toBeUndefined();
      seen.set(key, zone.id);
    }
  });

  it("makes every recipe input available or lists it as a known source gap", () => {
    const producible = new Set<string>(startingStockpileKit.map((item) => item.materialId));
    for (const recipe of content.recipes.all()) {
      recipe.outputs.forEach((output) => producible.add(output.materialId));
    }
    for (const job of content.jobs.all()) {
      job.outputs.forEach((output) => producible.add(output.materialId));
    }
    for (const zone of content.zones.all()) {
      zone.cropOutputs.forEach((output) => producible.add(output.materialId));
    }
    for (const prototype of content.enginePrototypes.all()) {
      const trader = prototype.components["Trader"];
      if (typeof trader === "object" && trader !== null && "sells" in trader) {
        const sells = trader["sells"];
        for (const offer of Array.isArray(sells) ? sells : []) {
          if (typeof offer === "object" && offer !== null && "materialId" in offer) {
            producible.add(String(offer["materialId"]));
          }
        }
      }
    }
    const undeclared: string[] = [];
    for (const recipe of content.recipes.all()) {
      for (const input of recipe.inputs) {
        content.materials.require(input.materialId);
        if (!producible.has(input.materialId) && !knownGaps.has(input.materialId)) {
          undeclared.push(`${recipe.id}:${input.materialId}`);
        }
      }
    }
    expect(undeclared).toEqual([]);
    for (const gap of knownGaps) {
      content.materials.require(gap);
    }
  });

  it("resolves every recipe workstation, skill and room zone", () => {
    const tags = new Set(content.furniture.all().flatMap((piece) => piece.tags));
    for (const recipe of content.recipes.all()) {
      expect(tags.has(recipe.workstationTag), `${recipe.id} workstation`).toBe(true);
      if (recipe.skillId !== null) {
        content.skills.require(recipe.skillId);
      }
      if (recipe.roomZoneId !== undefined) {
        content.zones.require(recipe.roomZoneId);
      }
    }
  });

  it("resolves every zone furniture requirement to furniture", () => {
    const tags = new Set(content.furniture.all().flatMap((piece) => piece.tags));
    for (const zone of content.zones.all()) {
      for (const group of zone.furnitureRequirements) {
        for (const alternative of group) {
          const resolves =
            alternative.kind === FurnitureRefKind.Id
              ? content.furniture.find(alternative.ref) !== undefined
              : tags.has(alternative.ref);
          expect(resolves, `${zone.id} needs ${alternative.ref}`).toBe(true);
        }
      }
    }
  });

  it("never unlocks a recipe or zone below the tier of its workstation or furniture", () => {
    for (const recipe of content.recipes.all()) {
      const stations = content.furniture
        .all()
        .filter((piece) => piece.tags.includes(recipe.workstationTag))
        .map((piece) => tierOf(piece.unlockTier));
      expect(tierOf(recipe.unlockTier), recipe.id).toBeGreaterThanOrEqual(Math.min(...stations));
    }
    for (const zone of content.zones.all()) {
      for (const group of zone.furnitureRequirements) {
        const tiers = group.flatMap((alternative) =>
          content.furniture
            .all()
            .filter((piece) =>
              alternative.kind === FurnitureRefKind.Id
                ? piece.id === alternative.ref
                : piece.tags.includes(alternative.ref),
            )
            .map((piece) => tierOf(piece.unlockTier)),
        );
        expect(tierOf(zone.unlockTier), zone.id).toBeGreaterThanOrEqual(Math.min(...tiers));
      }
    }
  });

  it("keeps every tier reachable from a Hamlet start", () => {
    expect(validateTierReachability(content)).toEqual([]);
  });

  it("lands the zone types with their spec tiers and effects", () => {
    expect(content.zones.require("carpentry").furnitureRequirements).toHaveLength(2);
    expect(content.zones.require("dormitory").furnitureRequirements[0]?.[0]?.count).toBe(3);
    expect(content.zones.require("warehouse").unlockTier).toBe("village");
    expect(content.zones.require("vineyard").unlockTier).toBe("market_town");
    expect(content.zones.require("guard_post").effects[0]?.modifierId).toBe("safety.bonus");
  });
});
