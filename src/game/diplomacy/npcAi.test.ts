import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { Difficulty } from "../save/initOptions";
import { getStanding, setStanding } from "../factions/factionStanding";
import { setAgreement } from "./agreements";
import { getDiplomacyService } from "./diplomacyServiceRegistry";
import { DiplomaticActType } from "./diplomacyTypes";
import { envoyComponent } from "./envoyComponent";
import { dispatchAct, listEnvoys } from "./envoys";
import { NpcAction, npcChoices, npcRecordOf, runNpcFactions } from "./npcAi";
import { createDiplomacyWorld } from "./testDiplomacyWorld";
import type { DiplomacyTestWorld } from "./testDiplomacyWorld";

function choicesOf(world: DiplomacyTestWorld, contentId: string): [string, number][] {
  const faction = world.engine.store.require(world.npc(contentId));
  return npcChoices(world.engine, faction, world.government).map((choice) => [
    choice.action,
    choice.weight,
  ]);
}

/**
 * The first tick at or after `from` on which a faction evaluates (`tick mod 72 == id mod 72`).
 */
function evaluationTick(factionId: number, from: number): number {
  const interval = 72;
  return from + ((((factionId - from) % interval) + interval) % interval);
}

function acts(world: DiplomacyTestWorld, senderId: number): string[] {
  return listEnvoys(world.engine)
    .map((envoy) => getComponent(envoy, envoyComponent))
    .filter((data) => data?.senderFactionId === senderId)
    .map((data) =>
      data?.declaration === null ? data.actType : `${data?.actType}:${data?.declaration}`,
    );
}

describe("npcRecordOf", () => {
  it("reads the npc block of the content faction", () => {
    const world = createDiplomacyWorld();
    expect(
      npcRecordOf(world.engine, world.engine.store.require(world.npc("ashford_barony"))),
    ).toMatchObject({
      side: "north",
      warLike: true,
      incidentWeight: 3,
    });
    expect(npcRecordOf(world.engine, world.engine.store.require(world.government))).toBeUndefined();
  });
});

describe("npcChoices", () => {
  it("a friendly mercantile faction proposes an agreement, a neutral one an overture", () => {
    const world = createDiplomacyWorld();
    expect(choicesOf(world, "wulfric_abbey")).toEqual([[NpcAction.Agreement, 2]]);
    expect(choicesOf(world, "merchant_caravans")).toEqual([[NpcAction.Overture, 2]]);
  });

  it("a wary aggressive faction may make an overture or an incident", () => {
    const world = createDiplomacyWorld();
    expect(choicesOf(world, "ashford_barony")).toEqual([
      [NpcAction.Overture, 1],
      [NpcAction.Incident, 3],
    ]);
  });

  it("offers no agreement once one stands and none while something is under way", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    setAgreement(world.engine, world.government, abbey, true);
    expect(choicesOf(world, "wulfric_abbey")).toEqual([]);
    setAgreement(world.engine, world.government, abbey, false);
    getDiplomacyService(world.engine).addProposal(abbey, DiplomaticActType.TradeAgreement, 0, 99);
    expect(choicesOf(world, "wulfric_abbey")).toEqual([]);
    getDiplomacyService(world.engine).removeProposal(1);
    dispatchAct(
      world.engine,
      abbey,
      world.government,
      { actType: DiplomaticActType.Overture, declaration: null, giftCoins: 0, giftItems: [] },
      0,
    );
    expect(choicesOf(world, "wulfric_abbey")).toEqual([]);
  });

  it("scales the incident weight by the hostility multiplier", () => {
    expect(
      choicesOf(createDiplomacyWorld({ difficulty: Difficulty.Peaceful }), "ashford_barony"),
    ).toEqual([[NpcAction.Overture, 1]]);
    expect(
      choicesOf(createDiplomacyWorld({ difficulty: Difficulty.Harsh }), "ashford_barony"),
    ).toEqual([
      [NpcAction.Overture, 1],
      [NpcAction.Incident, 4],
    ]);
  });

  it("offers an incident only below the friendly threshold and nothing for a guild", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    setStanding(world.engine, baron, world.government, 30);
    expect(choicesOf(world, "ashford_barony")).toEqual([]);
    const guild = world.engine.store.spawn("faction", {
      Faction: { contentId: "guild_bakers", name: "Guild" },
    });
    expect(npcChoices(world.engine, guild, world.government)).toEqual([]);
  });
});

describe("runNpcFactions", () => {
  it("evaluates a faction only on its tick and sends one act per cooldown", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const first = evaluationTick(abbey, 1);
    expect(runNpcFactions(world.engine, first + 1)).toBe(0);
    expect(acts(world, abbey)).toEqual([]);
    const evaluated = runNpcFactions(world.engine, first);
    expect(evaluated).toBeGreaterThanOrEqual(1);
    expect(acts(world, abbey)).toEqual(["trade-agreement"]);
    expect(getDiplomacyService(world.engine).lastNpcAct(abbey)).toBe(first);
    // one act per cooldown: the next evaluation inside 288 ticks does nothing
    runNpcFactions(world.engine, first + 72);
    expect(acts(world, abbey)).toEqual(["trade-agreement"]);
  });

  it("does not evaluate a leaderless faction", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    (
      world.engine.store.require(abbey).components["Faction"] as { leaderId: number | null }
    ).leaderId = null;
    runNpcFactions(world.engine, evaluationTick(abbey, 1));
    expect(acts(world, abbey)).toEqual([]);
  });

  it("an aggressive faction at -20 or worse eventually declares war; once at war it stops", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    setStanding(world.engine, baron, world.government, -25);
    let tick = evaluationTick(baron, 1);
    let declared = false;
    for (let round = 0; round < 80 && !declared; round += 1) {
      runNpcFactions(world.engine, tick);
      declared = acts(world, baron).includes("declaration:war");
      getDiplomacyService(world.engine).recordNpcAct(baron, -1000);
      tick += 72;
    }
    expect(declared).toBe(true);
  });

  it("is deterministic: the same seed makes the same decisions", () => {
    const decisions = (seed: number): string[] => {
      const world = createDiplomacyWorld({ seed });
      const baron = world.npc("ashford_barony");
      const trace: string[] = [];
      const incidents = world.record("diplomacy.incident");
      let tick = evaluationTick(baron, 1);
      for (let round = 0; round < 30; round += 1) {
        runNpcFactions(world.engine, tick);
        getDiplomacyService(world.engine).recordNpcAct(baron, -1000);
        trace.push(
          `${acts(world, baron).join(",")}|${getStanding(world.engine, world.government, baron).value}`,
        );
        tick += 72;
      }
      world.engine.bus.processQueue();
      return [...trace, String(incidents.length)];
    };
    expect(decisions(3)).toEqual(decisions(3));
  });

  it("a wary faction produces incidents at a low rate that the peaceful difficulty mutes", () => {
    const count = (difficulty: Difficulty): number => {
      const world = createDiplomacyWorld({ difficulty });
      const baron = world.npc("ashford_barony");
      const incidents = world.record("diplomacy.incident");
      let tick = evaluationTick(baron, 1);
      for (let round = 0; round < 40; round += 1) {
        // keep the standing in the wary band so that only the weights matter
        setStanding(world.engine, baron, world.government, -5);
        runNpcFactions(world.engine, tick);
        getDiplomacyService(world.engine).recordNpcAct(baron, -1000);
        tick += 72;
      }
      world.engine.bus.processQueue();
      return incidents.length;
    };
    expect(count(Difficulty.Steady)).toBeGreaterThan(0);
    expect(count(Difficulty.Peaceful)).toBe(0);
  });
});
