import { describe, expect, it } from "vitest";
import { getStanding } from "../factions/factionStanding";
import { Difficulty } from "../save/initOptions";
import { hasAgreement } from "./agreements";
import { getDiplomacyService } from "./diplomacyServiceRegistry";
import { createDiplomacyWorld } from "./testDiplomacyWorld";
import type { DiplomacyTestWorld } from "./testDiplomacyWorld";

type Row = {
  contentId: string;
  npc: boolean;
  ourAttitude: string;
  theirAttitude: string;
  leaderId: number | null;
  factionId: number;
  theirStanding: number;
  ourStanding: number;
};

function rows(world: DiplomacyTestWorld): Row[] {
  return world.query("factions-diplomacy") as Row[];
}

function failure(world: DiplomacyTestWorld, kind: string, payload: object): string {
  try {
    world.command(kind, payload as never);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the command to be refused");
}

// @covers 021:FR-010 021:FR-011 021:FR-014 021:SC-001
describe("registerDiplomacy", () => {
  it("registers the commands, the queries and the Envoy component", () => {
    const world = createDiplomacyWorld();
    for (const kind of [
      "IssueDiplomaticAct",
      "CancelDiplomaticDirective",
      "RespondToProposal",
      "SetFactionLeader",
    ]) {
      expect(world.engine.getCommandHandler(kind)).toBeDefined();
    }
    for (const name of ["factions-diplomacy", "directives", "agreements", "envoys", "proposals"]) {
      expect(world.engine.getQuery(name)).toBeDefined();
    }
    expect(world.engine.components.has("Envoy")).toBe(true);
  });

  it("seeds three NPC factions with differing attitudes in a new world", () => {
    const world = createDiplomacyWorld();
    const npcs = rows(world).filter((row) => row.npc);
    expect(npcs.map((row) => row.contentId)).toEqual([
      "merchant_caravans",
      "ashford_barony",
      "wulfric_abbey",
    ]);
    expect(npcs.every((row) => row.leaderId !== null)).toBe(true);
    expect(npcs.map((row) => row.theirAttitude)).toEqual(["neutral", "wary", "friendly"]);
    expect(npcs.map((row) => row.ourAttitude)).toEqual(["neutral", "wary", "friendly"]);
  });

  it("seeds the NPC factions in a generated world (new game with a map), once", () => {
    const world = createDiplomacyWorld();
    const view = world.engine.getQuery("factions");
    expect(view).toBeDefined();
    expect(
      (world.query("factions") as { contentId: string | null }[]).filter(
        (faction) => faction.contentId !== null,
      ),
    ).toHaveLength(3);
  });

  it("takes the hostility multiplier from the difficulty on a new game", () => {
    expect(
      getDiplomacyService(
        createDiplomacyWorld({ difficulty: Difficulty.Peaceful }).engine,
      ).hostilityMultiplierMilli(),
    ).toBe(250);
    expect(
      getDiplomacyService(
        createDiplomacyWorld({ difficulty: Difficulty.Harsh }).engine,
      ).hostilityMultiplierMilli(),
    ).toBe(1500);
  });
});

describe("IssueDiplomaticAct", () => {
  it("sends a gift: coins leave the treasury, the envoy arrives, standing rises", () => {
    const world = createDiplomacyWorld();
    const ashford = world.npc("ashford_barony");
    const before = world.treasury();
    const reply = world.command("IssueDiplomaticAct", {
      actType: "gift",
      targetFactionId: ashford,
      gift: { coins: 100 },
    }) as { envoyId: number; etaTick: number };
    expect(world.treasury()).toBe(before - 100);
    const directives = world.query("directives") as { status: string; ticksLeft: number }[];
    expect(directives).toHaveLength(1);
    expect(directives[0]?.status).toBe("traveling");
    world.run(reply.etaTick + 2);
    const row = rows(world).find((entry) => entry.factionId === ashford);
    expect(row?.theirStanding).toBe(-5 + 10);
    expect(row?.ourStanding).toBe(-5 + 5);
  });

  it("accepts a gift given as a list of goods", () => {
    const world = createDiplomacyWorld();
    expect(
      failure(world, "IssueDiplomaticAct", {
        actType: "gift",
        targetFactionId: world.npc("ashford_barony"),
        gift: [{ materialId: "bread", quantity: 3 }],
      }),
    ).toContain("InsufficientFunds");
  });

  it("proposes a trade agreement that a friendly faction accepts on delivery", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const reply = world.command("IssueDiplomaticAct", {
      actType: "trade-agreement",
      targetFactionId: abbey,
    }) as { etaTick: number };
    world.run(reply.etaTick + 1);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(true);
    expect(world.query("agreements")).toHaveLength(1);
    expect(getStanding(world.engine, abbey, world.government).value).toBeGreaterThanOrEqual(34);
  });

  it("refuses with the catalogue's error and queues diplomacy.act.refused", () => {
    const world = createDiplomacyWorld();
    const refused = world.record("diplomacy.act.refused");
    expect(
      failure(world, "IssueDiplomaticAct", { actType: "overture", targetFactionId: 9999 }),
    ).toContain("UnknownFaction");
    expect(
      failure(world, "IssueDiplomaticAct", {
        actType: "gift",
        targetFactionId: world.npc("wulfric_abbey"),
        gift: { coins: world.treasury() + 1 },
      }),
    ).toContain("InsufficientFunds");
    world.engine.bus.processQueue();
    expect(refused.map((entry) => (entry as { kind: string }).kind)).toEqual([
      "UnknownFaction",
      "InsufficientFunds",
    ]);
  });

  it("rejects unknown payload fields", () => {
    const world = createDiplomacyWorld();
    expect(() =>
      world.engine.getCommandHandler("IssueDiplomaticAct")?.schema.parse({
        actType: "overture",
        targetFactionId: 3,
        extra: 1,
      }),
    ).toThrow();
  });
});

describe("CancelDiplomaticDirective", () => {
  it("cancels a directive in flight and refunds the gift", () => {
    const world = createDiplomacyWorld();
    const before = world.treasury();
    const reply = world.command("IssueDiplomaticAct", {
      actType: "gift",
      targetFactionId: world.npc("wulfric_abbey"),
      gift: { coins: 200 },
    }) as { envoyId: number };
    expect(world.treasury()).toBe(before - 200);
    world.command("CancelDiplomaticDirective", { envoyId: reply.envoyId });
    expect(world.treasury()).toBe(before);
    world.run(1);
    expect(world.query("directives")).toEqual([]);
  });

  it("refuses an unknown envoy and one that has already delivered", () => {
    const world = createDiplomacyWorld();
    expect(failure(world, "CancelDiplomaticDirective", { envoyId: 9999 })).toContain(
      "UnknownDirective",
    );
    const reply = world.command("IssueDiplomaticAct", {
      actType: "overture",
      targetFactionId: world.npc("wulfric_abbey"),
    }) as { envoyId: number; etaTick: number };
    world.run(reply.etaTick + 1);
    expect(failure(world, "CancelDiplomaticDirective", { envoyId: reply.envoyId })).toContain(
      "NotCancellable",
    );
  });
});

describe("RespondToProposal", () => {
  it("answers a proposal an NPC envoy brought", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    getDiplomacyService(world.engine).addProposal(abbey, "trade-agreement" as never, 0, 576);
    world.command("RespondToProposal", { proposalId: 1, response: "accept" });
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(true);
    expect(failure(world, "RespondToProposal", { proposalId: 1, response: "accept" })).toContain(
      "UnknownProposal",
    );
  });
});

describe("SetFactionLeader", () => {
  it("sets a member as leader, refuses a non-member and lets the succession fill a gap", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const members = (world.query("members-of", { factionId: abbey }) as { memberIds: number[] })
      .memberIds;
    const leader = (world.engine.store.require(abbey).components["Faction"] as { leaderId: number })
      .leaderId;
    const other = members.find((id) => id !== leader) ?? 0;
    expect(world.command("SetFactionLeader", { factionId: abbey, entityId: other })).toEqual({
      changed: true,
    });
    expect(
      failure(world, "SetFactionLeader", { factionId: abbey, entityId: world.government }),
    ).toContain("NotMember");
    world.command("SetFactionLeader", { factionId: abbey, entityId: null });
    world.run(1);
    expect(
      (world.engine.store.require(abbey).components["Faction"] as { leaderId: number | null })
        .leaderId,
    ).not.toBeNull();
  });
});
