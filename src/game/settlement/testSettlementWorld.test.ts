import { describe, expect, it } from "vitest";
import { DwellingLevel } from "../content/contentTypes";
import { membersOf } from "../factions/factionMembership";
import { getSettlementService } from "./settlementServiceRegistry";
import { contentWithTiers, createSettlementWorld } from "./testSettlementWorld";

describe("createSettlementWorld", () => {
  it("adds settlers who belong to the government and a dwelling hook", () => {
    const world = createSettlementWorld();
    const ids = world.addSettlers(3);
    expect(ids).toHaveLength(3);
    expect(membersOf(world.engine, world.government).map((entity) => entity.id)).toEqual(ids);
    world.setDwellings(4);
    expect(getSettlementService(world.engine).countDwellingsAtOrAbove(DwellingLevel.Hovel)).toBe(4);
  });

  it("runs to the start of a day and shows the progress record", () => {
    const world = createSettlementWorld();
    world.runToDay(2);
    expect(world.engine.time.tickCount).toBe(576);
    expect(world.progress().evaluations).toBe(2);
  });

  it("loads a pack with another tier table", () => {
    const content = contentWithTiers([
      { tier: "hamlet", settlementNoun: "camp" },
      { tier: "village", settlementNoun: "village" },
      { tier: "market_town", settlementNoun: "market town" },
      { tier: "chartered_town", settlementNoun: "town" },
    ]);
    expect(content.settlementTiers.require("hamlet").settlementNoun).toBe("camp");
  });
});
