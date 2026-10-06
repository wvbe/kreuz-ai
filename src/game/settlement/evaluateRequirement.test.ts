import { describe, expect, it } from "vitest";
import { DwellingLevel, MilestoneKind, TierRequirementKind } from "../content/contentTypes";
import { setFactionLeader } from "../factions/factionLeader";
import { joinFaction } from "../factions/factionMembership";
import { spawnContentFaction } from "../factions/factionRegistry";
import { evaluateRequirement, settlementPopulation } from "./evaluateRequirement";
import type { TierRequirement } from "./evaluateRequirement";
import { recordMilestone } from "./recordMilestone";
import { createSettlementWorld } from "./testSettlementWorld";

describe("settlementPopulation", () => {
  it("counts the members of the government faction", () => {
    const world = createSettlementWorld();
    expect(settlementPopulation(world.engine)).toBe(0);
    world.addSettlers(4);
    expect(settlementPopulation(world.engine)).toBe(4);
  });
});

describe("evaluateRequirement", () => {
  it("reports population current, target and the one-line label", () => {
    const world = createSettlementWorld();
    world.addSettlers(5);
    const progress = evaluateRequirement(world.engine, {
      kind: TierRequirementKind.Population,
      min: 8,
    });
    expect(progress).toMatchObject({ current: 5, target: 8, met: false });
    expect(progress.label).toBe("population 5/8");
    world.addSettlers(3);
    expect(
      evaluateRequirement(world.engine, { kind: TierRequirementKind.Population, min: 8 }).met,
    ).toBe(true);
  });

  it("asks the dwelling hook of housing", () => {
    const world = createSettlementWorld();
    const requirement: TierRequirement = {
      kind: TierRequirementKind.DwellingsAtLevel,
      level: DwellingLevel.Hovel,
      min: 4,
    };
    expect(evaluateRequirement(world.engine, requirement)).toMatchObject({
      current: 0,
      target: 4,
      met: false,
      params: { level: "hovel" },
    });
    world.setDwellings(4);
    expect(evaluateRequirement(world.engine, requirement).met).toBe(true);
  });

  it("counts active zones of the listed types", () => {
    const world = createSettlementWorld();
    const requirement: TierRequirement = {
      kind: TierRequirementKind.ActiveZone,
      zoneTypeIds: ["stockpile"],
      min: 1,
    };
    expect(evaluateRequirement(world.engine, requirement)).toMatchObject({
      current: 0,
      met: false,
    });
    world.command("DesignateZone", {
      zoneTypeId: "stockpile",
      mapId: world.mapId,
      cells: [40, 41],
      reassign: false,
    });
    world.engine.runTicks(2);
    const progress = evaluateRequirement(world.engine, requirement);
    expect(progress).toMatchObject({ current: 1, target: 1, met: true });
    expect(progress.params).toEqual({ zoneTypeIds: ["stockpile"] });
    expect(progress.label).toBe("active stockpile zone 1/1");
  });

  it("counts founded guilds", () => {
    const world = createSettlementWorld();
    const requirement: TierRequirement = { kind: TierRequirementKind.FoundedGuilds, min: 1 };
    expect(evaluateRequirement(world.engine, requirement).current).toBe(0);
    const guild = spawnContentFaction(world.engine, "guild_bakers");
    const members = world.addSettlers(3);
    for (const member of members) {
      joinFaction(world.engine, member, guild.id);
    }
    setFactionLeader(world.engine, guild.id, members[0] ?? 0);
    expect(evaluateRequirement(world.engine, requirement)).toMatchObject({ current: 1, met: true });
  });

  it("is met by a recorded milestone", () => {
    const world = createSettlementWorld();
    const requirement: TierRequirement = {
      kind: TierRequirementKind.MilestoneReached,
      milestone: MilestoneKind.FirstTradeAgreement,
    };
    expect(evaluateRequirement(world.engine, requirement)).toMatchObject({ met: false, target: 1 });
    recordMilestone(world.engine, MilestoneKind.FirstTradeAgreement, [3]);
    const progress = evaluateRequirement(world.engine, requirement);
    expect(progress.met).toBe(true);
    expect(progress.params).toEqual({ milestone: "first-trade-agreement" });
  });
});
