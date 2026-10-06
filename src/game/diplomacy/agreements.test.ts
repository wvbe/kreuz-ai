import { describe, expect, it } from "vitest";
import { getStanding, setStanding } from "../factions/factionStanding";
import { hasAgreement, listAgreements, setAgreement } from "./agreements";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

// @covers 021:FR-009
describe("setAgreement", () => {
  it("sets the flag on both lists, keeps the values and queues formed once", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const formed = world.record("diplomacy.agreement.formed");
    const before = getStanding(world.engine, world.government, abbey).value;
    expect(setAgreement(world.engine, world.government, abbey, true)).toBe(true);
    expect(setAgreement(world.engine, abbey, world.government, true)).toBe(false);
    world.engine.bus.processQueue();
    expect(formed).toEqual([{ factionAId: world.government, factionBId: abbey }]);
    expect(getStanding(world.engine, world.government, abbey)).toMatchObject({
      value: before,
      tradeAgreement: true,
    });
    expect(getStanding(world.engine, abbey, world.government).tradeAgreement).toBe(true);
  });

  it("cancels on both lists and queues cancelled", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const cancelled = world.record("diplomacy.agreement.cancelled");
    setAgreement(world.engine, world.government, abbey, true);
    expect(setAgreement(world.engine, world.government, abbey, false)).toBe(true);
    expect(setAgreement(world.engine, world.government, abbey, false)).toBe(false);
    world.engine.bus.processQueue();
    expect(cancelled).toHaveLength(1);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
  });
});

describe("hasAgreement", () => {
  it("is true when either side carries the flag", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
    setStanding(world.engine, abbey, world.government, 25, true);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(true);
    expect(hasAgreement(world.engine, abbey, world.government)).toBe(true);
  });
});

describe("listAgreements", () => {
  it("lists each pair once, lower id first, ascending", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const merchants = world.npc("merchant_caravans");
    setAgreement(world.engine, world.government, abbey, true);
    setAgreement(world.engine, merchants, world.government, true);
    expect(listAgreements(world.engine)).toEqual([
      { factionAId: world.government, factionBId: merchants },
      { factionAId: world.government, factionBId: abbey },
    ]);
  });

  it("is empty without agreements", () => {
    expect(listAgreements(createDiplomacyWorld().engine)).toEqual([]);
  });
});
