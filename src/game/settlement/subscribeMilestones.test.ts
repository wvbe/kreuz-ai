import { describe, expect, it } from "vitest";
import { setFactionLeader } from "../factions/factionLeader";
import { joinFaction } from "../factions/factionMembership";
import { spawnContentFaction } from "../factions/factionRegistry";
import { createSettlementWorld } from "./testSettlementWorld";

function milestonesOf(world: ReturnType<typeof createSettlementWorld>): string[] {
  return world.progress().milestones.map((record) => record.milestone);
}

describe("subscribeMilestones", () => {
  // @covers 027:FR-019 027:FR-020
  it("records the throne room once, however often it is activated again", () => {
    const world = createSettlementWorld();
    for (let round = 0; round < 3; round += 1) {
      world.engine.bus.emit("zone.requirements.met", {
        zoneId: 30 + round,
        zoneTypeId: "throne_room",
      });
      world.engine.runTicks(1);
    }
    expect(world.progress().milestones).toEqual([
      { milestone: "throne-room-established", tick: 0, subjectIds: [30] },
    ]);
    expect(world.milestoneEvents).toHaveLength(1);
  });

  it("records a first worship space (chapel or church) and a first market", () => {
    const world = createSettlementWorld();
    world.engine.bus.emit("zone.requirements.met", { zoneId: 31, zoneTypeId: "church" });
    world.engine.bus.emit("zone.requirements.met", { zoneId: 32, zoneTypeId: "market" });
    world.engine.bus.emit("zone.requirements.met", { zoneId: 33, zoneTypeId: "stockpile" });
    world.engine.runTicks(1);
    expect(milestonesOf(world)).toEqual(["first-worship-space", "first-market"]);
  });

  it("records the first guild founded once it has members and a leader", () => {
    const world = createSettlementWorld();
    const guild = spawnContentFaction(world.engine, "guild_bakers");
    const members = world.addSettlers(3);
    joinFaction(world.engine, members[0] ?? 0, guild.id);
    joinFaction(world.engine, members[1] ?? 0, guild.id);
    expect(milestonesOf(world)).toEqual([]);
    joinFaction(world.engine, members[2] ?? 0, guild.id);
    setFactionLeader(world.engine, guild.id, members[0] ?? 0);
    world.engine.runTicks(1);
    expect(world.progress().milestones).toEqual([
      { milestone: "first-guild-founded", tick: 0, subjectIds: [guild.id] },
    ]);
  });

  // @covers 027:FR-019
  it("records a master craftsman only for a settlement member", () => {
    const world = createSettlementWorld();
    const [member] = world.addSettlers(1);
    const outsider = world.spawn("peasant", 70);
    const title = { skillId: "baking", rank: "master", noun: "Baker", guildId: null };
    world.engine.bus.emit("identity.title.changed", {
      entityId: outsider.id,
      oldTitle: null,
      newTitle: title,
    });
    world.engine.bus.emit("identity.title.changed", {
      entityId: member ?? 0,
      oldTitle: null,
      newTitle: { ...title, rank: "practitioner" },
    });
    world.engine.runTicks(1);
    expect(milestonesOf(world)).toEqual([]);
    world.engine.bus.emit("identity.title.changed", {
      entityId: member ?? 0,
      oldTitle: null,
      newTitle: title,
    });
    world.engine.runTicks(1);
    expect(world.progress().milestones[0]).toMatchObject({
      milestone: "first-master-craftsman",
      subjectIds: [member],
    });
  });

  it("records the first trade agreement that involves the government", () => {
    const world = createSettlementWorld();
    const abbey = spawnContentFaction(world.engine, "wulfric_abbey");
    const barony = spawnContentFaction(world.engine, "ashford_barony");
    world.engine.bus.emit("diplomacy.agreement.formed", {
      factionAId: abbey.id,
      factionBId: barony.id,
    });
    world.engine.runTicks(1);
    expect(milestonesOf(world)).toEqual([]);
    world.engine.bus.emit("diplomacy.agreement.formed", {
      factionAId: world.government,
      factionBId: abbey.id,
    });
    world.engine.runTicks(1);
    expect(world.progress().milestones[0]).toMatchObject({
      milestone: "first-trade-agreement",
      subjectIds: [abbey.id],
    });
  });

  it("records the first dwelling upgrade with the dwelling as subject", () => {
    const world = createSettlementWorld();
    world.engine.bus.emit("housing.dwelling.upgraded", { dwellingId: 77 });
    world.engine.bus.emit("housing.dwelling.upgraded", { dwellingId: 78 });
    world.engine.runTicks(1);
    expect(world.progress().milestones).toEqual([
      { milestone: "first-dwelling-upgrade", tick: 0, subjectIds: [77] },
    ]);
  });

  it("ignores payloads of another shape", () => {
    const world = createSettlementWorld();
    world.engine.bus.emit("zone.requirements.met", { nonsense: true });
    world.engine.bus.emit("identity.title.changed", "nope");
    world.engine.bus.emit("diplomacy.agreement.formed", {});
    world.engine.runTicks(1);
    expect(milestonesOf(world)).toEqual([]);
  });
});
