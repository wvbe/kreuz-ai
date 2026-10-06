import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { factionComponent } from "../factions/factionComponent";
import { setFactionLeader } from "../factions/factionLeader";
import { joinFaction } from "../factions/factionMembership";
import { skillsComponent } from "../skills/skillsComponent";
import { runSuccession } from "./runSuccession";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

function leaderOf(
  world: ReturnType<typeof createDiplomacyWorld>,
  factionId: number,
): number | null {
  return getComponent(world.engine.store.require(factionId), factionComponent)?.leaderId ?? null;
}

// @covers 021:FR-003 021:SC-004
describe("runSuccession", () => {
  it("does nothing while every faction has a leader", () => {
    const world = createDiplomacyWorld();
    expect(runSuccession(world.engine)).toBe(0);
  });

  it("appoints the member with the greatest total skill, ties to the lowest id", () => {
    const world = createDiplomacyWorld();
    const events = world.record("faction.leader.changed");
    const first = world.settler(2);
    const second = world.settler(3);
    const third = world.settler(4);
    for (const member of [first, second, third]) {
      joinFaction(world.engine, member.id, world.government);
    }
    const skills = (id: number, total: number): void => {
      const data = getComponent(world.engine.store.require(id), skillsComponent);
      if (data !== undefined) {
        data.values = { farming: total };
      }
    };
    skills(first.id, 20000);
    skills(second.id, 300000);
    skills(third.id, 300000);
    // the leader of the settlement leaves
    setFactionLeader(world.engine, world.government, null);
    expect(runSuccession(world.engine)).toBe(1);
    expect(leaderOf(world, world.government)).toBe(second.id);
    world.engine.bus.processQueue();
    expect(events).toContainEqual({
      factionId: world.government,
      oldLeaderId: null,
      newLeaderId: second.id,
    });
  });

  it("picks the next leader the tick after a leader is deleted", () => {
    const world = createDiplomacyWorld();
    const heir = world.settler(2);
    joinFaction(world.engine, heir.id, world.government);
    const oldLeader = leaderOf(world, world.government) as number;
    world.engine.store.requestDelete(oldLeader);
    world.run(1);
    expect(leaderOf(world, world.government)).toBeNull();
    world.run(1);
    expect(leaderOf(world, world.government)).toBe(heir.id);
  });

  it("leaves a faction without members leaderless, but an NPC faction gets a new heir", () => {
    const world = createDiplomacyWorld();
    const lonely = world.engine.store.spawn("faction", {
      Faction: { contentId: "guild_bakers", name: "Guild" },
    });
    const baron = world.npc("ashford_barony");
    for (const member of world.engine.store
      .entities()
      .filter((entity) => entity.prototype === "npc_leader")) {
      const faction = getComponent(world.engine.store.require(baron), factionComponent);
      if (faction?.leaderId === member.id) {
        world.engine.store.requestDelete(member.id);
      }
    }
    world.run(1);
    // the heir of the barony takes over at once
    world.run(1);
    expect(leaderOf(world, baron)).not.toBeNull();
    expect(leaderOf(world, lonely.id)).toBeNull();
  });

  it("gives an NPC faction without any member a freshly born leader", () => {
    const world = createDiplomacyWorld();
    const baron = world.npc("ashford_barony");
    const members = world.engine.store
      .entities()
      .filter((entity) => entity.prototype === "npc_leader")
      .filter((entity) =>
        (entity.components["Citizen"] as { factions: number[] }).factions.includes(baron),
      );
    for (const member of members) {
      world.engine.store.requestDelete(member.id);
    }
    world.run(1);
    expect(leaderOf(world, baron)).toBeNull();
    world.run(1);
    const leader = leaderOf(world, baron);
    expect(leader).not.toBeNull();
    expect(members.map((member) => member.id)).not.toContain(leader);
  });
});
