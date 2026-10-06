import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { citizenComponent } from "../factions/citizenComponent";
import { setFactionLeader } from "../factions/factionLeader";
import { joinFaction, leaveFaction } from "../factions/factionMembership";
import { ensureContentFaction } from "../factions/factionRegistry";
import { appointSteward, dismissSteward } from "../standing/steward";
import { recordMoment } from "./recordMoment";
import { createChronicleWorld } from "./testChronicleWorld";
import { NotableMomentKind } from "../content/contentTypes";

function skillRose(
  world: ReturnType<typeof createChronicleWorld>,
  entityId: number,
  skillId: string,
  level: number,
): void {
  world.setLevel(entityId, skillId, level);
  world.engine.bus.emit("skill.increased", {
    entityId,
    skillId,
    oldValue: level - 1,
    newValue: level,
  });
  world.flush();
}

describe("subscribeMoments", () => {
  it("records Arrived once when a citizen joins the player government", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    expect(world.ofKind("arrived")).toHaveLength(1);
    expect(world.ofKind("arrived")[0]).toMatchObject({ prominence: "minor", entityId: citizen.id });
    joinFaction(world.engine, citizen.id, world.government);
    world.flush();
    expect(world.ofKind("arrived")).toHaveLength(1);
    expect(world.chronicle()).toEqual([]);
  });

  it("records TitleEarned (Minor) at the threshold and MasteryAchieved (Major) at the master level", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    skillRose(world, citizen.id, "baking", 19);
    expect(world.ofKind("title_earned")).toEqual([]);
    skillRose(world, citizen.id, "baking", 20);
    skillRose(world, citizen.id, "baking", 21);
    expect(world.ofKind("title_earned")).toHaveLength(1);
    expect(world.ofKind("title_earned")[0]).toMatchObject({
      prominence: "minor",
      params: { skillId: "baking", noun: "Baker" },
    });
    skillRose(world, citizen.id, "baking", 60);
    expect(world.ofKind("mastery_achieved")).toHaveLength(1);
    expect(world.ofKind("mastery_achieved")[0]).toMatchObject({
      prominence: "major",
      params: { skillId: "baking", noun: "Baker", guildId: "guild_bakers" },
    });
    expect(world.chronicle().map((record) => record.kind)).toEqual([
      "became_finest",
      "mastery_achieved",
      "settlement_milestone",
    ]);
    expect(world.ofKind("title_earned")).toHaveLength(1);
  });

  it("records JoinedGuild and LeftGuild for occupational factions only", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const guild = ensureContentFaction(world.engine, "guild_bakers");
    const other = ensureContentFaction(world.engine, "merchant_caravans");
    joinFaction(world.engine, citizen.id, guild.id);
    joinFaction(world.engine, citizen.id, other.id);
    world.flush();
    leaveFaction(world.engine, citizen.id, guild.id);
    world.flush();
    expect(world.ofKind("joined_guild")).toHaveLength(1);
    expect(world.ofKind("joined_guild")[0]?.params).toEqual({
      factionId: guild.id,
      guildName: "Bakers' guild",
    });
    expect(world.ofKind("left_guild")).toHaveLength(1);
  });

  it("records TookOffice (Major) and LostOffice (Minor) for a leader change", () => {
    const world = createChronicleWorld();
    const first = world.addCitizen();
    const second = world.addCitizen();
    const guild = ensureContentFaction(world.engine, "guild_bakers");
    joinFaction(world.engine, first.id, guild.id);
    joinFaction(world.engine, second.id, guild.id);
    setFactionLeader(world.engine, guild.id, first.id);
    world.flush();
    expect(world.ofKind("took_office").map((record) => record.entityId)).toEqual([first.id]);
    expect(world.ofKind("took_office")[0]).toMatchObject({
      prominence: "major",
      params: { factionId: guild.id, office: "Master Baker" },
    });
    setFactionLeader(world.engine, guild.id, second.id);
    world.flush();
    expect(world.ofKind("took_office").map((record) => record.entityId)).toEqual([
      first.id,
      second.id,
    ]);
    expect(world.ofKind("lost_office").map((record) => record.entityId)).toEqual([first.id]);
  });

  it("records the Steward's office when appointed and dismissed, but none for a dead Steward", () => {
    const world = createChronicleWorld();
    const steward = world.addCitizen();
    appointSteward(world.engine, steward.id);
    world.flush();
    expect(world.ofKind("took_office")[0]?.params).toEqual({
      factionId: world.government,
      office: "Steward",
    });
    expect(world.ofKind("took_office")[0]?.nameSnapshot).toContain("Steward of the");
    dismissSteward(world.engine);
    world.flush();
    expect(world.ofKind("lost_office")).toHaveLength(1);
    const dying = world.addCitizen();
    appointSteward(world.engine, dying.id);
    world.flush();
    world.engine.store.requestDelete(dying.id);
    world.engine.store.flushDeletions();
    world.engine.runTicks(1);
    expect(world.ofKind("lost_office")).toHaveLength(1);
    expect(world.ofKind("died").map((record) => record.entityId)).toEqual([dying.id]);
  });

  it("records FirstWork once per skill, even after the journal dropped the entry", () => {
    const world = createChronicleWorld();
    const citizen = world.addCitizen();
    const work = (skillId: string) => {
      world.engine.bus.emit("skill.work.completed", { entityId: citizen.id, skillId });
      world.flush();
    };
    work("baking");
    work("baking");
    expect(world.ofKind("first_work")).toHaveLength(1);
    expect(world.identityOf(citizen.id).seenSkills).toEqual(["baking"]);
    for (let index = 0; index < 30; index += 1) {
      recordMoment(world.engine, {
        kind: NotableMomentKind.Renamed,
        entityId: citizen.id,
        params: { previousName: `Name ${index}` },
      });
    }
    expect(world.identityOf(citizen.id).journal.some((entry) => entry.kind === "first_work")).toBe(
      false,
    );
    work("baking");
    expect(world.ofKind("first_work")).toHaveLength(1);
    work("farming");
    expect(world.ofKind("first_work").map((record) => record.params["skillId"])).toEqual([
      "baking",
      "farming",
    ]);
    expect(world.identityOf(citizen.id).seenSkills).toEqual(["baking", "farming"]);
  });

  it("records FirstTrade once for each member party and ignores outsiders", () => {
    const world = createChronicleWorld();
    const buyer = world.addCitizen();
    const seller = world.addCitizen();
    const trader = world.engine.store.spawn("peasant");
    const trade = (buyerId: number, sellerId: number) => {
      world.engine.bus.emit("trade.completed", {
        offerId: 1,
        buyerId,
        sellerId,
        items: [],
        payment: [],
        tick: 0,
      });
      world.flush();
    };
    trade(buyer.id, seller.id);
    trade(buyer.id, trader.id);
    trade(trader.id, seller.id);
    const records = world.ofKind("first_trade");
    expect(records.map((record) => [record.entityId, record.params["partnerId"]])).toEqual([
      [buyer.id, seller.id],
      [seller.id, buyer.id],
    ]);
    expect(world.identityOf(buyer.id).tradeSeen).toBe(true);
  });

  it("records HomeImproved for every resident of an upgraded dwelling", () => {
    const world = createChronicleWorld();
    const residents = [world.addCitizen(), world.addCitizen()];
    const stranger = world.addCitizen();
    for (const resident of residents) {
      const citizen = getComponent(resident, citizenComponent);
      if (citizen !== undefined) {
        citizen.homeDwellingId = 77;
      }
    }
    world.engine.bus.emit("housing.dwelling.upgraded", {
      dwellingId: 77,
      fromLevel: "cottage",
      toLevel: "timber_framed_house",
    });
    world.flush();
    const records = world.ofKind("home_improved");
    expect(records.map((record) => record.entityId)).toEqual(residents.map((entity) => entity.id));
    expect(records[0]?.params).toEqual({ dwellingId: 77, dwellingLevel: "timber_framed_house" });
    expect(world.identityOf(stranger.id).journal.map((entry) => entry.kind)).toEqual(["arrived"]);
  });

  it("records SettlementMilestone and TierReached in the chronicle without a citizen", () => {
    const world = createChronicleWorld();
    world.engine.bus.emit("settlement.milestone.reached", {
      milestone: "first-guild-founded",
      tick: 5,
      subjectIds: [4],
    });
    world.engine.bus.emit("settlement.tier.reached", {
      tier: "village",
      previousTier: "hamlet",
      tick: 6,
    });
    world.flush();
    expect(world.chronicle().map((record) => [record.kind, record.entityId])).toEqual([
      ["settlement_milestone", null],
      ["tier_reached", null],
    ]);
    expect(world.chronicle()[1]?.params).toEqual({ tier: "village", previousTier: "hamlet" });
  });

  it("ignores malformed payloads and records nothing for outsiders", () => {
    const world = createChronicleWorld();
    const outsider = world.engine.store.spawn("peasant");
    world.engine.bus.emit("skill.work.completed", { entityId: "x" });
    world.engine.bus.emit("settlement.tier.reached", {});
    world.engine.bus.emit("skill.work.completed", { entityId: outsider.id, skillId: "baking" });
    world.flush();
    expect(world.recorded).toEqual([]);
  });
});
