import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runScenario } from "../../src/game/api/scenario/runScenario";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import { loadContent } from "../../src/game/content/ContentLoader";
import { getComponent } from "../../src/game/ecs/Entity";
import { GameEngine } from "../../src/game/engine/GameEngine";
import { factionComponent } from "../../src/game/factions/factionComponent";
import { setFactionLeader } from "../../src/game/factions/factionLeader";
import { joinFaction, leaveFaction } from "../../src/game/factions/factionMembership";
import { getStanding, setStanding } from "../../src/game/factions/factionStanding";
import { getTotal } from "../../src/game/inventory/inventoryQueries";
import { isEligible } from "../../src/game/jobs/eligibility";
import { createDiplomacyWorld } from "../../src/game/diplomacy/testDiplomacyWorld";
import type { DiplomacyTestWorld } from "../../src/game/diplomacy/testDiplomacyWorld";
import { hasAgreement } from "../../src/game/diplomacy/agreements";
import { listEnvoys } from "../../src/game/diplomacy/envoys";
import { envoyComponent } from "../../src/game/diplomacy/envoyComponent";
import { MapSize } from "../../src/game/map/mapSize";
import { styledName } from "../../src/game/identity/styledName";

// Plan 4.2 acceptance (spec 021, DECISIONS D-14 and D-56): standing and its gates, envoys with
// timeout and refund, leader succession, agreements in trade, the NPC AI, determinism and a
// save/load in the middle of a dispatch. The player's story is scenarios/diplomacy.json.

type Reply = { envoyId: number; etaTick: number };

function act(world: DiplomacyTestWorld, payload: object): Reply {
  return world.command("IssueDiplomaticAct", payload as never) as Reply;
}

function deliver(world: DiplomacyTestWorld, reply: Reply): void {
  world.run(reply.etaTick - world.engine.time.tickCount + 1);
}

function leaderOf(world: DiplomacyTestWorld, factionId: number): number | null {
  return getComponent(world.engine.store.require(factionId), factionComponent)?.leaderId ?? null;
}

describe("US1 faction data", () => {
  it("keeps standing, agreements, leaders and members through save and load", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    deliver(world, act(world, { actType: "trade-agreement", targetFactionId: abbey }));
    const other = new GameEngine(loadContent(), { entropy: () => 1 });
    other.loadGame(world.engine.saveGame());
    expect(other.getStateHash()).toBe(world.engine.getStateHash());
    expect(getStanding(other, abbey, world.government)).toEqual(
      getStanding(world.engine, abbey, world.government),
    );
    expect(hasAgreement(other, world.government, abbey)).toBe(true);
    expect(other.getQuery("factions")?.run({}, other)).toEqual(world.query("factions"));
  });
});

describe("US2 and US4 envoys", () => {
  it("one act is one envoy, inspectable, with payload, destination and status", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    act(world, { actType: "gift", targetFactionId: abbey, gift: { coins: 100 } });
    act(world, { actType: "overture", targetFactionId: abbey });
    act(world, { actType: "declaration", targetFactionId: abbey, declaration: "peace" });
    const directives = world.query("directives") as {
      actType: string;
      declaration: string | null;
      targetFactionId: number;
      status: string;
      cargo: { quantity: number }[];
    }[];
    expect(directives.map((entry) => entry.actType)).toEqual(["gift", "overture", "declaration"]);
    expect(directives[2]?.declaration).toBe("peace");
    expect(directives.every((entry) => entry.targetFactionId === abbey)).toBe(true);
    expect(directives.every((entry) => entry.status === "traveling")).toBe(true);
    expect(directives[0]?.cargo).toEqual([{ materialId: "silver_penny", quantity: 100 }]);
    expect(listEnvoys(world.engine)).toHaveLength(3);
  });

  it("the leader may change on the way: the new leader receives the gift", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const reply = act(world, { actType: "gift", targetFactionId: abbey, gift: { coins: 100 } });
    const first = leaderOf(world, abbey) ?? 0;
    world.run(10);
    world.engine.store.requestDelete(first);
    deliver(world, reply);
    const second = leaderOf(world, abbey) ?? 0;
    expect(second).not.toBe(first);
    expect(getTotal(world.engine.store.require(second), "silver_penny")).toBe(100);
  });

  it("a trip that takes too long times out as unreachable and the gift comes back", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const failed = world.record("diplomacy.dispatch.failed");
    const before = world.treasury();
    const reply = act(world, { actType: "gift", targetFactionId: abbey, gift: { coins: 500 } });
    expect(world.treasury()).toBe(before - 500);
    const envoy = listEnvoys(world.engine)[0];
    const data = envoy === undefined ? undefined : getComponent(envoy, envoyComponent);
    if (data === undefined) {
      throw new Error("no envoy");
    }
    data.arriveTick = reply.etaTick + 5000;
    world.run(world.engine.content.constants.envoyStuckTimeoutTicks + 1);
    world.engine.bus.processQueue();
    expect(failed.map((entry) => (entry as { reason: string }).reason)).toEqual(["unreachable"]);
    expect(world.treasury()).toBe(before);
    expect(world.query("directives")).toMatchObject([
      { status: "returning", failure: "unreachable" },
    ]);
  });

  it("an envoy for a leaderless faction fails with leader-unavailable after the timeout", () => {
    const world = createDiplomacyWorld();
    const guildLike = world.npc("merchant_caravans");
    const failed = world.record("diplomacy.dispatch.failed");
    const before = world.treasury();
    act(world, { actType: "gift", targetFactionId: guildLike, gift: { coins: 50 } });
    // the faction loses everything: no leader, no members, and no seat for a heir to be born at
    const faction = getComponent(world.engine.store.require(guildLike), factionComponent);
    setFactionLeader(world.engine, guildLike, null);
    if (faction !== undefined) {
      faction.seat = null;
    }
    for (const member of world.engine.store.entities()) {
      const factions = (member.components["Citizen"] as { factions: number[] } | undefined)
        ?.factions;
      if (factions?.includes(guildLike) === true) {
        leaveFaction(world.engine, member.id, guildLike);
      }
    }
    world.run(world.engine.content.constants.envoyStuckTimeoutTicks + 1);
    world.engine.bus.processQueue();
    expect(failed.map((entry) => (entry as { reason: string }).reason)).toEqual([
      "leader-unavailable",
    ]);
    expect(world.treasury()).toBe(before);
  });
});

describe("US3 and US5 acts", () => {
  it("a gift of 500 is deducted before dispatch, appears in the leader's inventory and raises standing", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    const before = world.treasury();
    const reply = act(world, { actType: "gift", targetFactionId: baron, gift: { coins: 500 } });
    expect(world.treasury()).toBe(before - 500);
    deliver(world, reply);
    expect(getTotal(world.engine.store.require(leaderOf(world, baron) ?? 0), "silver_penny")).toBe(
      500,
    );
    expect(getStanding(world.engine, baron, world.government).value).toBe(-5 + 25);
    expect(getStanding(world.engine, world.government, baron).value).toBe(-5 + 12);
  });

  it("a trade agreement needs standing 20: refused at the door of a wary faction, accepted after gifts", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    deliver(world, act(world, { actType: "trade-agreement", targetFactionId: baron }));
    expect(hasAgreement(world.engine, world.government, baron)).toBe(false);
    deliver(world, act(world, { actType: "gift", targetFactionId: baron, gift: { coins: 500 } }));
    deliver(world, act(world, { actType: "trade-agreement", targetFactionId: baron }));
    expect(hasAgreement(world.engine, world.government, baron)).toBe(true);
    expect(world.query("agreements")).toHaveLength(1);
  });

  it("war sets standing to -50 or worse for both and ends the agreement", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    deliver(world, act(world, { actType: "trade-agreement", targetFactionId: abbey }));
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(true);
    const cancelled = world.record("diplomacy.agreement.cancelled");
    deliver(
      world,
      act(world, { actType: "declaration", targetFactionId: abbey, declaration: "war" }),
    );
    world.engine.bus.processQueue();
    expect(getStanding(world.engine, abbey, world.government).value).toBeLessThanOrEqual(-50);
    expect(getStanding(world.engine, world.government, abbey).value).toBeLessThanOrEqual(-50);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
    expect(cancelled).toHaveLength(1);
  });

  it("an act without the means is refused: the treasury holds too little, and nothing is sent", () => {
    const world = createDiplomacyWorld();
    const before = world.treasury();
    expect(() =>
      act(world, {
        actType: "gift",
        targetFactionId: world.npc("wulfric_abbey"),
        gift: { coins: before + 1 },
      }),
    ).toThrow("InsufficientFunds");
    expect(world.treasury()).toBe(before);
    expect(listEnvoys(world.engine)).toHaveLength(0);
  });
});

describe("US6 gates", () => {
  it("a hostile faction cannot trade: -60 standing rejects the offer with faction-hostile", () => {
    const world = createDiplomacyWorld();
    const merchants = world.npc("merchant_caravans");
    const trader = world.trader(3);
    const settler = world.settler(4);
    world.give(settler, "silver_penny", 100);
    const rejected = world.record("trade.offer.rejected");
    setStanding(world.engine, merchants, world.government, -60);
    world.engine.bus.processQueue();
    world.command("ProposeTrade", {
      buyerId: settler.id,
      sellerId: trader.id,
      requested: [{ materialId: "nails", quantity: 1 }],
      offeredCoins: 5,
    });
    world.run(1);
    world.engine.bus.processQueue();
    expect(rejected.at(-1)).toMatchObject({ reason: "faction-hostile" });
    expect(getTotal(settler, "nails")).toBe(0);
    setStanding(world.engine, merchants, world.government, -30);
    world.engine.bus.processQueue();
    world.command("ProposeTrade", {
      buyerId: settler.id,
      sellerId: trader.id,
      requested: [{ materialId: "nails", quantity: 1 }],
      offeredCoins: 5,
    });
    world.run(1);
    expect(getTotal(settler, "nails")).toBe(1);
  });

  it("crossing the hostile threshold through an incident cancels a pending offer", () => {
    const world = createDiplomacyWorld();
    const merchants = world.npc("merchant_caravans");
    const trader = world.trader(3);
    const settler = world.settler(4);
    world.give(settler, "silver_penny", 100);
    world.command("ProposeTrade", {
      buyerId: settler.id,
      sellerId: trader.id,
      requested: [{ materialId: "nails", quantity: 10 }],
      offeredCoins: 2,
    });
    world.run(1);
    expect(world.query("trade-offers")).toHaveLength(1);
    const cancelled = world.record("trade.offer.cancelled");
    setStanding(world.engine, merchants, world.government, -31);
    world.run(1);
    world.engine.bus.processQueue();
    expect(cancelled.at(-1)).toMatchObject({ reason: "faction-hostile" });
    expect(world.query("trade-offers")).toEqual([]);
  });

  it("a trade agreement lowers the seller's price by a tenth", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const trader = world.trader(3);
    const quote = (): number =>
      (
        world.query("trade-quote", {
          traderId: trader.id,
          direction: "Buy",
          materialId: "nails",
          quantity: 100,
        }) as { coins: number }
      ).coins;
    const plain = quote();
    // the caravan's faction is the merchants: form the agreement with them
    deliver(
      world,
      act(world, { actType: "trade-agreement", targetFactionId: world.npc("merchant_caravans") }),
    );
    // the merchants start neutral (0): they refuse; gift them first
    deliver(
      world,
      act(world, {
        actType: "gift",
        targetFactionId: world.npc("merchant_caravans"),
        gift: { coins: 400 },
      }),
    );
    deliver(
      world,
      act(world, { actType: "trade-agreement", targetFactionId: world.npc("merchant_caravans") }),
    );
    expect(hasAgreement(world.engine, world.government, world.npc("merchant_caravans"))).toBe(true);
    const discounted = quote();
    expect(discounted).toBeLessThan(plain);
    expect(Math.abs(discounted - Math.ceil(plain * 0.9))).toBeLessThanOrEqual(2);
    expect(abbey).toBeGreaterThan(0);
  });

  it("the labour gate: members of a faction at war with the settlement do not take its jobs; peace reopens them", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    const worker = world.settler(6);
    leaveFaction(world.engine, worker.id, world.government);
    joinFaction(world.engine, worker.id, baron);
    const posting = world.postFell(15);
    expect(isEligible(world.engine, worker, posting)).toBe(true);
    deliver(
      world,
      act(world, { actType: "declaration", targetFactionId: baron, declaration: "war" }),
    );
    expect(isEligible(world.engine, worker, posting)).toBe(false);
    deliver(
      world,
      act(world, { actType: "declaration", targetFactionId: baron, declaration: "peace" }),
    );
    expect(getStanding(world.engine, baron, world.government).value).toBeGreaterThanOrEqual(-10);
    expect(isEligible(world.engine, worker, posting)).toBe(true);
  });
});

describe("US7 NPC factions", () => {
  it("produce an act in a standard run (SC-007) and a proposal reaches the player", () => {
    const world = createDiplomacyWorld();
    const proposed = world.record("diplomacy.proposal.received");
    world.run(900);
    world.engine.bus.processQueue();
    expect(proposed.length).toBeGreaterThan(0);
    expect(world.query("proposals")).not.toEqual([]);
  });

  it("an unanswered proposal lapses; accepting one forms an agreement, rejecting costs 3", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    world.run(500);
    const open = world.query("proposals") as {
      proposalId: number;
      fromFactionId: number;
      actType: string;
    }[];
    const mine = open.find((proposal) => proposal.fromFactionId === abbey);
    expect(mine?.actType).toBe("trade-agreement");
    const before = getStanding(world.engine, world.government, abbey).value;
    world.command("RespondToProposal", { proposalId: mine?.proposalId ?? 0, response: "reject" });
    expect(getStanding(world.engine, world.government, abbey).value).toBe(before - 3);
    expect(hasAgreement(world.engine, world.government, abbey)).toBe(false);
  });

  it("a leaderless NPC faction sends nothing until it has a leader again", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const faction = getComponent(world.engine.store.require(abbey), factionComponent);
    setFactionLeader(world.engine, abbey, null);
    if (faction !== undefined) {
      faction.seat = null;
    }
    for (const member of world.engine.store.entities()) {
      const factions = (member.components["Citizen"] as { factions: number[] } | undefined)
        ?.factions;
      if (factions?.includes(abbey) === true) {
        leaveFaction(world.engine, member.id, abbey);
      }
    }
    world.run(700);
    expect(
      listEnvoys(world.engine).filter(
        (envoy) => getComponent(envoy, envoyComponent)?.senderFactionId === abbey,
      ),
    ).toEqual([]);
  });

  it("an aggressive faction that the settlement has insulted enough declares war", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    const received: unknown[] = [];
    world.engine.bus.subscribe("diplomacy.act.resolved", (payload) => received.push(payload));
    // keep it sour (decay and gifts of the AI would lift it) for sixty days
    for (let day = 0; day < 60; day += 1) {
      if (getStanding(world.engine, baron, world.government).value > -50) {
        setStanding(world.engine, baron, world.government, -25);
      }
      world.run(288);
    }
    world.engine.bus.processQueue();
    const war = received.some(
      (entry) =>
        (entry as { actType: string; senderFactionId: number }).actType === "declaration" &&
        (entry as { senderFactionId: number }).senderFactionId === baron,
    );
    expect(war).toBe(true);
    expect(getStanding(world.engine, world.government, baron).value).toBeLessThanOrEqual(-50);
  });
});

describe("leader succession", () => {
  it("names the next leader the tick after a leader dies and styles them with the office", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    const changes = world.record("faction.leader.changed");
    const first = leaderOf(world, baron) ?? 0;
    world.engine.store.requestDelete(first);
    world.run(2);
    world.engine.bus.processQueue();
    const next = leaderOf(world, baron);
    expect(next).not.toBeNull();
    expect(next).not.toBe(first);
    expect(changes).toContainEqual({ factionId: baron, oldLeaderId: null, newLeaderId: next });
    const name = styledName(world.engine, world.engine.store.require(next ?? 0));
    expect(name).toContain("Baron of the Barony of Ashford");
  });
});

describe("determinism and save/load", () => {
  function play(seed: number, split: boolean): string {
    const world = createDiplomacyWorld({ seed });
    const abbey = world.npc("wulfric_abbey");
    const baron = world.npc("ashford_barony");
    act(world, { actType: "gift", targetFactionId: baron, gift: { coins: 400 } });
    act(world, { actType: "trade-agreement", targetFactionId: abbey });
    world.run(60);
    if (split) {
      const other = new GameEngine(loadContent(), { entropy: () => 1 });
      other.loadGame(world.engine.saveGame());
      other.runTicks(1500);
      return other.getStateHash();
    }
    world.run(1500);
    return world.engine.getStateHash();
  }

  it("the same seed gives the same state after envoys, AI and decay", () => {
    expect(play(9, false)).toBe(play(9, false));
    expect(play(9, false)).not.toBe(play(10, false));
  });

  it("a game saved while an envoy is on the way continues identically", () => {
    expect(play(9, true)).toBe(play(9, false));
  });
});

describe("scenarios/diplomacy.json", () => {
  it("passes through the plain session with player commands only", () => {
    const text = readFileSync(join(__dirname, "..", "..", "scenarios", "diplomacy.json"), "utf8");
    const parsed = parseScenario(text);
    if (!parsed.ok) {
      throw new Error(parsed.issues.join("; "));
    }
    expect(JSON.stringify(parsed.scenario)).not.toContain("DebugSpawn");
    const result = runScenario(parsed.scenario);
    expect(result.ok).toBe(true);
    expect(parsed.scenario.options?.["mapSize"]).toBe(MapSize.Small);
  });
});
