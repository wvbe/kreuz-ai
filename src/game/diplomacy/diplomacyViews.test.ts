import { describe, expect, it } from "vitest";
import { setAgreement } from "./agreements";
import { receiveProposal } from "./proposals";
import { DiplomaticActType } from "./diplomacyTypes";
import { dispatchAct } from "./envoys";
import {
  buildAgreementViews,
  buildDiplomacyView,
  buildDirectiveViews,
  buildEnvoyViews,
  buildProposalViews,
} from "./diplomacyViews";
import { createDiplomacyWorld } from "./testDiplomacyWorld";
import { setStanding } from "../factions/factionStanding";

describe("buildDiplomacyView", () => {
  it("lists every other faction with both views, their bands and the derived hostile flag", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    setStanding(world.engine, baron, world.government, -40);
    const rows = buildDiplomacyView(world.engine);
    expect(rows.map((row) => row.contentId)).toEqual([
      "merchant_caravans",
      "ashford_barony",
      "wulfric_abbey",
    ]);
    const row = rows.find((entry) => entry.factionId === baron);
    expect(row).toMatchObject({
      name: "Barony of Ashford",
      npc: true,
      ourStanding: -5,
      ourAttitude: "wary",
      theirStanding: -40,
      theirAttitude: "hostile",
      hostile: true,
      tradeAgreement: false,
      travelTicks: 71,
      envoysUnderWay: 0,
    });
    expect(row?.leaderName).toContain("Baron of the Barony of Ashford");
    expect(rows.filter((entry) => entry.hostile)).toHaveLength(1);
  });

  it("shows agreements and envoys under way", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    setAgreement(world.engine, world.government, abbey, true);
    dispatchAct(
      world.engine,
      world.government,
      abbey,
      { actType: DiplomaticActType.Overture, declaration: null, giftCoins: 0, giftItems: [] },
      0,
    );
    const row = buildDiplomacyView(world.engine).find((entry) => entry.factionId === abbey);
    expect(row).toMatchObject({ tradeAgreement: true, envoysUnderWay: 1 });
  });

  it("is empty without a game", () => {
    const world = createDiplomacyWorld();
    world.engine.store.requestDelete(world.government);
    world.engine.store.flushDeletions();
    expect(buildDiplomacyView(world.engine)).toEqual([]);
  });
});

describe("buildEnvoyViews and buildDirectiveViews", () => {
  it("shows the ETA, the cargo and the deadline; directives are the outgoing envoys only", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const envoy = dispatchAct(
      world.engine,
      world.government,
      abbey,
      { actType: DiplomaticActType.Gift, declaration: null, giftCoins: 50, giftItems: [] },
      0,
    );
    dispatchAct(
      world.engine,
      abbey,
      world.government,
      { actType: DiplomaticActType.Overture, declaration: null, giftCoins: 0, giftItems: [] },
      0,
    );
    const all = buildEnvoyViews(world.engine);
    expect(all).toHaveLength(2);
    const directives = buildDirectiveViews(world.engine);
    expect(directives).toHaveLength(1);
    expect(directives[0]).toMatchObject({
      envoyId: envoy.id,
      targetFactionId: abbey,
      targetName: "Abbey of St Wulfric",
      outgoing: true,
      actType: "gift",
      status: "traveling",
      cargo: [{ materialId: "silver_penny", quantity: 50 }],
      giftValueCoins: 50,
      deadlineTick: 576,
      waiting: false,
      failure: null,
    });
    expect(directives[0]?.ticksLeft).toBe(directives[0]?.etaTick);
    expect(all.find((view) => !view.outgoing)?.senderName).toBe("Abbey of St Wulfric");
  });
});

describe("buildAgreementViews", () => {
  it("names both sides of each agreement", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    setAgreement(world.engine, world.government, abbey, true);
    expect(buildAgreementViews(world.engine)).toEqual([
      {
        factionAId: world.government,
        factionAName: "Settlement",
        factionBId: abbey,
        factionBName: "Abbey of St Wulfric",
      },
    ]);
  });
});

describe("buildProposalViews", () => {
  it("shows who proposes what and how long it stays open", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    receiveProposal(world.engine, abbey, DiplomaticActType.TradeAgreement, 0);
    expect(buildProposalViews(world.engine)).toEqual([
      {
        proposalId: 1,
        fromFactionId: abbey,
        fromName: "Abbey of St Wulfric",
        actType: "trade-agreement",
        createdTick: 0,
        expiryTick: 576,
        ticksLeft: 576,
      },
    ]);
  });
});
