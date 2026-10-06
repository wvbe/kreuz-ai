import { describe, expect, it } from "vitest";
import { Difficulty } from "../save/initOptions";
import { getStanding, setStanding } from "../factions/factionStanding";
import { hasAgreement, setAgreement } from "./agreements";
import { getDiplomacyService } from "./diplomacyServiceRegistry";
import { DeclarationKind } from "./diplomacyTypes";
import {
  adjustStanding,
  applyAcceptance,
  applyDeclaration,
  applyGift,
  decayStandings,
  giftDelta,
  isNpcFaction,
  scaleHostileDelta,
} from "./standingRules";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

// @covers 021:FR-006 021:FR-007 021:FR-009
describe("giftDelta (standing arithmetic, D-14)", () => {
  const world = createDiplomacyWorld();
  const constants = world.engine.content.constants;

  it.each([
    [0, 5],
    [19, 5],
    [20, 6],
    [100, 10],
    [250, 17],
    [400, 25],
    [10_000, 25],
  ])("a gift worth %i coins buys +%i", (value, expected) => {
    expect(giftDelta(constants, value)).toBe(expected);
  });
});

describe("isNpcFaction", () => {
  it("is true for the seeded factions only", () => {
    const world = createDiplomacyWorld();
    expect(isNpcFaction(world.engine, world.npc("ashford_barony"))).toBe(true);
    expect(isNpcFaction(world.engine, world.government)).toBe(false);
    expect(isNpcFaction(world.engine, 9999)).toBe(false);
  });
});

describe("scaleHostileDelta", () => {
  it.each([
    [Difficulty.Peaceful, -5, -1],
    [Difficulty.Steady, -5, -5],
    [Difficulty.Harsh, -5, -7],
    [Difficulty.Harsh, 5, 5],
    [Difficulty.Peaceful, 5, 5],
    [Difficulty.Peaceful, -2, 0],
  ])("on %s a delta of %i becomes %i", (difficulty, delta, expected) => {
    const world = createDiplomacyWorld({ difficulty });
    expect(scaleHostileDelta(world.engine, delta)).toBe(expected);
  });
});

describe("adjustStanding", () => {
  it("adds to the value, clamps and scales only NPC negatives toward the government", () => {
    const world = createDiplomacyWorld({ difficulty: Difficulty.Harsh });
    const baron = world.npc("ashford_barony");
    expect(adjustStanding(world.engine, world.government, baron, -10)).toBe(-15);
    // the baron is an NPC faction: its negative delta toward the government is 1.5x
    expect(adjustStanding(world.engine, baron, world.government, -10)).toBe(-5 - 15);
    expect(adjustStanding(world.engine, baron, world.government, 200)).toBe(100);
    expect(adjustStanding(world.engine, world.government, baron, -500)).toBe(-100);
  });
});

describe("applyGift", () => {
  it("raises the receiver by the delta and the giver by half of it, rounded down", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const delta = applyGift(world.engine, world.government, abbey, 100);
    expect(delta).toBe(10);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(25 + 10);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(20 + 5);
    expect(applyGift(world.engine, world.government, abbey, 0)).toBe(5);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(20 + 5 + 2);
  });

  it("clamps at 100", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    for (let gift = 0; gift < 6; gift += 1) {
      applyGift(world.engine, world.government, abbey, 1000);
    }
    expect(getStanding(world.engine, abbey, world.government).value).toBe(100);
  });
});

describe("applyAcceptance", () => {
  it("adds the same delta to both views and optionally forms the agreement", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    applyAcceptance(world.engine, world.government, abbey, 5, false);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(30);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(25);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
    applyAcceptance(world.engine, world.government, abbey, 10, true);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(40);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(true);
  });
});

describe("applyDeclaration", () => {
  it("war sets both views to at most -60 (the worse stays) and cancels the agreement", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    setAgreement(world.engine, world.government, abbey, true);
    setStanding(world.engine, world.government, abbey, -80);
    applyDeclaration(world.engine, world.government, abbey, DeclarationKind.War);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(-80);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(-60);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
  });

  it("peace raises both views to at least -10 and keeps better values", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    setStanding(world.engine, world.government, abbey, -70);
    applyDeclaration(world.engine, world.government, abbey, DeclarationKind.Peace);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(-10);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(25);
  });

  it("neutrality sets both views to 0", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    applyDeclaration(world.engine, abbey, world.government, DeclarationKind.Neutrality);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(0);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(0);
  });
});

describe("decayStandings", () => {
  it("moves every non-zero value one point toward 0 and keeps agreement flags", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const baron = world.npc("ashford_barony");
    setAgreement(world.engine, world.government, abbey, true);
    setStanding(world.engine, world.government, baron, -1);
    const moved = decayStandings(world.engine);
    expect(getStanding(world.engine, abbey, world.government)).toMatchObject({
      value: 24,
      tradeAgreement: true,
    });
    expect(getStanding(world.engine, world.government, abbey).value).toBe(19);
    expect(getStanding(world.engine, baron, world.government).value).toBe(-4);
    expect(getStanding(world.engine, world.government, baron).value).toBe(0);
    expect(moved).toBe(4);
    expect(getDiplomacyService(world.engine).hostilityMultiplierMilli()).toBe(1000);
  });
});
