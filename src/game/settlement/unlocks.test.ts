import { describe, expect, it } from "vitest";
import { SettlementTier } from "../content/contentTypes";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";
import { getSettlementService } from "./settlementServiceRegistry";
import { LockedContentKind } from "./settlementTypes";
import { createSettlementWorld } from "./testSettlementWorld";
import { buildUnlockViews, getUnlockedAt, isUnlocked } from "./unlocks";

describe("unlocks", () => {
  it("lists every kind of content with its tier and lock text", () => {
    const world = createSettlementWorld({ content: loadVillageBakeryContent() });
    const rows = buildUnlockViews(world.engine);
    expect(new Set(rows.map((row) => row.contentKind))).toEqual(
      new Set(Object.values(LockedContentKind)),
    );
    const oven = rows.find((row) => row.contentId === "oven");
    expect(oven).toMatchObject({
      contentKind: "furniture",
      unlockTier: "village",
      unlocked: false,
      lockText: "Unlocks at Village",
    });
    const table = rows.find((row) => row.contentId === "table");
    expect(table).toMatchObject({ unlockTier: "hamlet", unlocked: true, lockText: null });
  });

  it("puts the dwelling levels in the table with the tiers of the decisions", () => {
    const world = createSettlementWorld();
    const levels = buildUnlockViews(world.engine)
      .filter((row) => row.contentKind === LockedContentKind.DwellingLevel)
      .map((row) => [row.contentId, row.unlockTier]);
    expect(levels).toEqual([
      ["hovel", "hamlet"],
      ["cottage", "village"],
      ["timber_framed_house", "market_town"],
      ["burgher_house", "market_town"],
    ]);
  });

  it("answers isUnlocked from the tier in force", () => {
    const world = createSettlementWorld({ content: loadVillageBakeryContent() });
    expect(isUnlocked(world.engine, LockedContentKind.Furniture, "oven")).toBe(false);
    expect(isUnlocked(world.engine, LockedContentKind.Furniture, "nothing")).toBe(false);
    getSettlementService(world.engine).setTier(SettlementTier.Village);
    expect(isUnlocked(world.engine, LockedContentKind.Furniture, "oven")).toBe(true);
    expect(isUnlocked(world.engine, LockedContentKind.DwellingLevel, "burgher_house")).toBe(false);
  });

  it("lists what a tier unlocks", () => {
    const world = createSettlementWorld({ content: loadVillageBakeryContent() });
    const village = getUnlockedAt(world.engine, SettlementTier.Village).map((row) => row.contentId);
    // the bundled pack grows with content tasks: the shippedIds rows stay, in this order
    const shippedIds = ["oven", "notice_post", "bakery", "bake_bread", "cottage"];
    expect(village.filter((id) => shippedIds.includes(id))).toEqual(shippedIds);
    expect(
      getUnlockedAt(world.engine, SettlementTier.CharteredTown).map((row) => row.contentId),
    ).not.toContain("notice_post");
  });
});
