import { describe, expect, it } from "vitest";
import { SettlementTier } from "../content/contentTypes";
import { joinFaction } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { setStanding } from "../factions/factionStanding";
import { defaultEligibility, isEligible, satisfiesEligibility } from "./eligibility";
import { getJobService } from "./jobServiceRegistry";
import { EligibilityKind } from "./jobTypes";
import { createJobWorld, noAiOverride } from "./testJobWorld";

function setup() {
  const world = createJobWorld();
  const worker = world.spawn("peasant", 5, noAiOverride);
  const posting = world.postFell(15);
  const government = governmentFactionId(world.engine) as number;
  const rival = world.engine.store.spawn("faction", {
    Faction: { name: "Raiders", factionType: "criminal" },
  });
  return { world, worker, posting, government, rival };
}

// @covers 016:FR-001b
// @covers 021:FR-008 021:SC-002
describe("defaultEligibility", () => {
  it("is a citizen who is not hostile to the poster", () => {
    expect(defaultEligibility()).toEqual([
      { kind: EligibilityKind.AdultHumanoid },
      { kind: EligibilityKind.NotHostileToPoster },
    ]);
    expect(defaultEligibility()).not.toBe(defaultEligibility());
  });
});

describe("satisfiesEligibility", () => {
  it("AdultHumanoid needs a Citizen component", () => {
    const { world, worker, posting } = setup();
    const predicate = { kind: EligibilityKind.AdultHumanoid } as const;
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(true);
    const board = world.engine.store.require(world.boardId);
    expect(satisfiesEligibility(world.engine, board, posting, predicate)).toBe(false);
  });

  it("FactionMember needs membership of that faction", () => {
    const { world, worker, posting, government } = setup();
    const predicate = { kind: EligibilityKind.FactionMember, factionId: government } as const;
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(false);
    joinFaction(world.engine, worker.id, government);
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(true);
  });

  it("NotHostileToPoster compares the mean standing toward the poster with -30", () => {
    const { world, worker, posting, government, rival } = setup();
    const predicate = { kind: EligibilityKind.NotHostileToPoster } as const;
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(true);
    joinFaction(world.engine, worker.id, rival.id);
    setStanding(world.engine, rival.id, government, -30);
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(true);
    setStanding(world.engine, rival.id, government, -31);
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(false);
    joinFaction(world.engine, worker.id, government);
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(true);
  });

  it("NotHostileToPoster averages over several factions with integer division", () => {
    const { world, worker, posting, government, rival } = setup();
    const friendly = world.engine.store.spawn("faction", { Faction: { name: "Guild" } });
    joinFaction(world.engine, worker.id, rival.id);
    joinFaction(world.engine, worker.id, friendly.id);
    setStanding(world.engine, rival.id, government, -60);
    setStanding(world.engine, friendly.id, government, 0);
    const predicate = { kind: EligibilityKind.NotHostileToPoster } as const;
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(true);
    setStanding(world.engine, friendly.id, government, -1);
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(true);
    setStanding(world.engine, rival.id, government, -100);
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(false);
  });

  it("MinSkill compares the skill level", () => {
    const { world, worker, posting } = setup();
    const skills = worker.components["Skills"] as { values: { [skillId: string]: number } };
    skills.values["woodcutting"] = 20_000;
    expect(
      satisfiesEligibility(world.engine, worker, posting, {
        kind: EligibilityKind.MinSkill,
        skillId: "woodcutting",
        level: 20,
      }),
    ).toBe(true);
    expect(
      satisfiesEligibility(world.engine, worker, posting, {
        kind: EligibilityKind.MinSkill,
        skillId: "woodcutting",
        level: 21,
      }),
    ).toBe(false);
  });

  it("TierUnlocked compares with the tier source", () => {
    const { world, worker, posting } = setup();
    const predicate = { kind: EligibilityKind.TierUnlocked, tier: SettlementTier.Village } as const;
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(false);
    getJobService(world.engine).setTierSource(() => SettlementTier.MarketTown);
    expect(satisfiesEligibility(world.engine, worker, posting, predicate)).toBe(true);
  });
});

describe("isEligible", () => {
  it("needs every predicate of the posting", () => {
    const { world, worker, posting } = setup();
    expect(isEligible(world.engine, worker, posting)).toBe(true);
    const strict = {
      ...posting,
      eligibility: [
        ...posting.eligibility,
        { kind: EligibilityKind.MinSkill, skillId: "woodcutting", level: 90 } as const,
      ],
    };
    expect(isEligible(world.engine, worker, strict)).toBe(false);
    expect(isEligible(world.engine, worker, { ...posting, eligibility: [] })).toBe(true);
  });
});
