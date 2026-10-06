import { describe, expect, it } from "vitest";
import { getStanding, setStanding } from "../factions/factionStanding";
import { hasAgreement, setAgreement } from "./agreements";
import { acceptsAgreement, acceptsOverture, applyAccepted, resolveAct } from "./actResolution";
import { DeclarationKind, DiplomaticActType } from "./diplomacyTypes";
import type { EnvoyData } from "./diplomacyTypes";
import { envoyComponent } from "./envoyComponent";
import { createDiplomacyWorld } from "./testDiplomacyWorld";
import type { DiplomacyTestWorld } from "./testDiplomacyWorld";

function message(
  world: DiplomacyTestWorld,
  targetId: number,
  actType: DiplomaticActType,
  extra: Partial<EnvoyData> = {},
): EnvoyData {
  return {
    ...envoyComponent.defaults(),
    senderFactionId: world.government,
    targetFactionId: targetId,
    actType,
    ...extra,
  };
}

// @covers 021:FR-009
describe("acceptsAgreement", () => {
  it("needs the target's standing to be at least 20 (E-20) and no hostility", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    expect(acceptsAgreement(world.engine, world.government, abbey)).toBe(true);
    setStanding(world.engine, abbey, world.government, 19);
    expect(acceptsAgreement(world.engine, world.government, abbey)).toBe(false);
    setStanding(world.engine, abbey, world.government, 20);
    expect(acceptsAgreement(world.engine, world.government, abbey)).toBe(true);
    setStanding(world.engine, world.government, abbey, -40);
    expect(acceptsAgreement(world.engine, world.government, abbey)).toBe(false);
  });

  it("counts an agreement that already stands as accepted", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    expect(acceptsAgreement(world.engine, world.government, baron)).toBe(false);
    setAgreement(world.engine, world.government, baron, true);
    expect(acceptsAgreement(world.engine, world.government, baron)).toBe(true);
  });
});

describe("acceptsOverture", () => {
  it("needs the target's standing to be at least -15", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    expect(acceptsOverture(world.engine, world.government, baron)).toBe(true);
    setStanding(world.engine, baron, world.government, -15);
    expect(acceptsOverture(world.engine, world.government, baron)).toBe(true);
    setStanding(world.engine, baron, world.government, -16);
    expect(acceptsOverture(world.engine, world.government, baron)).toBe(false);
  });
});

describe("applyAccepted", () => {
  it("an agreement is +10 both ways with the flag, an overture +5 both ways", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    applyAccepted(world.engine, DiplomaticActType.Overture, world.government, abbey);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(30);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
    applyAccepted(world.engine, DiplomaticActType.TradeAgreement, world.government, abbey);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(40);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(35);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(true);
  });
});

describe("resolveAct", () => {
  it("a gift raises standing by its value (100 coins: +10 and +5)", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    const resolved = world.record("diplomacy.act.resolved");
    const accepted = resolveAct(
      world.engine,
      77,
      message(world, baron, DiplomaticActType.Gift, { giftValueCoins: 100 }),
    );
    world.engine.bus.processQueue();
    expect(accepted).toBe(true);
    expect(getStanding(world.engine, baron, world.government).value).toBe(5);
    expect(getStanding(world.engine, world.government, baron).value).toBe(0);
    expect(resolved).toEqual([
      {
        envoyId: 77,
        senderFactionId: world.government,
        targetFactionId: baron,
        actType: "gift",
        accepted: true,
      },
    ]);
  });

  it("a trade agreement is accepted by a friendly faction and refused by a wary one", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const baron = world.npc("ashford_barony");
    expect(
      resolveAct(world.engine, 1, message(world, abbey, DiplomaticActType.TradeAgreement)),
    ).toBe(true);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(true);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(35);
    expect(
      resolveAct(world.engine, 2, message(world, baron, DiplomaticActType.TradeAgreement)),
    ).toBe(false);
    expect(hasAgreement(world.engine, world.government, baron)).toBe(false);
    expect(getStanding(world.engine, baron, world.government).value).toBe(-5);
  });

  it("war sets both views to -60 or worse and cancels the agreement", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    setAgreement(world.engine, world.government, abbey, true);
    resolveAct(
      world.engine,
      1,
      message(world, abbey, DiplomaticActType.Declaration, { declaration: DeclarationKind.War }),
    );
    expect(getStanding(world.engine, abbey, world.government).value).toBe(-60);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(-60);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
  });

  it("an overture is taken at -15 or better (+5 both) and answered with a -3 penalty otherwise", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    expect(resolveAct(world.engine, 1, message(world, baron, DiplomaticActType.Overture))).toBe(
      true,
    );
    expect(getStanding(world.engine, baron, world.government).value).toBe(0);
    expect(getStanding(world.engine, world.government, baron).value).toBe(0);
    setStanding(world.engine, baron, world.government, -20);
    expect(resolveAct(world.engine, 2, message(world, baron, DiplomaticActType.Overture))).toBe(
      false,
    );
    // the baron's own negative delta toward the settlement (steady: unscaled)
    expect(getStanding(world.engine, baron, world.government).value).toBe(-23);
  });
});
