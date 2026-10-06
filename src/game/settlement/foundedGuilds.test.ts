import { describe, expect, it } from "vitest";
import { setFactionLeader } from "../factions/factionLeader";
import { joinFaction } from "../factions/factionMembership";
import { spawnContentFaction } from "../factions/factionRegistry";
import { foundedGuilds } from "./foundedGuilds";
import { createSettlementWorld } from "./testSettlementWorld";

describe("foundedGuilds", () => {
  // @covers 027:FR-018
  it("counts a guild only with a leader and enough settlement members (spec 027 FR-018)", () => {
    const world = createSettlementWorld();
    const guild = spawnContentFaction(world.engine, "guild_bakers");
    const [first, second, third] = world.addSettlers(3);
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("no settlers");
    }
    expect(foundedGuilds(world.engine)).toEqual([]);
    joinFaction(world.engine, first, guild.id);
    joinFaction(world.engine, second, guild.id);
    setFactionLeader(world.engine, guild.id, first);
    expect(foundedGuilds(world.engine)).toEqual([]);
    joinFaction(world.engine, third, guild.id);
    expect(foundedGuilds(world.engine)).toEqual([guild.id]);
    setFactionLeader(world.engine, guild.id, null);
    expect(foundedGuilds(world.engine)).toEqual([]);
  });

  it("ignores members who do not belong to the settlement and non-guild factions", () => {
    const world = createSettlementWorld();
    const guild = spawnContentFaction(world.engine, "guild_bakers");
    const abbey = spawnContentFaction(world.engine, "wulfric_abbey");
    const ids = world.addSettlers(3);
    for (const id of ids) {
      joinFaction(world.engine, id, guild.id);
      joinFaction(world.engine, id, abbey.id);
    }
    setFactionLeader(world.engine, guild.id, ids[0] ?? 0);
    setFactionLeader(world.engine, abbey.id, ids[0] ?? 0);
    expect(foundedGuilds(world.engine)).toEqual([guild.id]);
    const masons = spawnContentFaction(world.engine, "guild_masons");
    const outsiders = [
      world.engine.store.spawn("peasant", {}),
      world.engine.store.spawn("peasant", {}),
    ];
    for (const outsider of outsiders) {
      joinFaction(world.engine, outsider.id, masons.id);
    }
    joinFaction(world.engine, ids[0] ?? 0, masons.id);
    setFactionLeader(world.engine, masons.id, ids[0] ?? 0);
    // three members, but only one of them belongs to the settlement
    expect(foundedGuilds(world.engine)).toEqual([guild.id]);
  });
});
