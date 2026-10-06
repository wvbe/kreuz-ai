import { describe, expect, it } from "vitest";
import { loadContent } from "./ContentLoader";
import { SettlementTier } from "./contentTypes";
import { loadVillageBakeryContent } from "./loadVillageBakeryContent";

describe("loadVillageBakeryContent", () => {
  it("locks the oven, the bakery zone and the bake_bread recipe at Village", () => {
    const content = loadVillageBakeryContent();
    expect(content.furniture.require("oven").unlockTier).toBe(SettlementTier.Village);
    expect(content.zones.require("bakery").unlockTier).toBe(SettlementTier.Village);
    expect(content.recipes.require("bake_bread").unlockTier).toBe(SettlementTier.Village);
  });

  it("leaves the bundled pack alone and everything else as it is", () => {
    const bundled = loadContent();
    expect(bundled.furniture.require("oven").unlockTier ?? null).toBeNull();
    const content = loadVillageBakeryContent();
    expect(content.furniture.require("workbench").unlockTier).toBe(SettlementTier.Hamlet);
    expect(content.recipes.ids()).toEqual(bundled.recipes.ids());
  });
});
