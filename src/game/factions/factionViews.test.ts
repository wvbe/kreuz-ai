import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { setFactionLeader } from "./factionLeader";
import { joinFaction } from "./factionMembership";
import { spawnContentFaction } from "./factionRegistry";
import { setStanding } from "./factionStanding";
import { buildFactionView, buildMembershipView } from "./factionViews";

function setup(): { engine: GameEngine; guild: number; baker: number } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 7 });
  const guild = spawnContentFaction(engine, "guild_bakers").id;
  const baker = engine.store.spawn("baker").id;
  joinFaction(engine, baker, guild);
  joinFaction(engine, baker, 1);
  setFactionLeader(engine, guild, baker);
  setStanding(engine, guild, 1, -35);
  return { engine, guild, baker };
}

// @covers 021:FR-015
describe("buildFactionView", () => {
  it("shows the faction data and its derived members", () => {
    const { engine, guild, baker } = setup();
    expect(buildFactionView(engine, engine.store.require(guild))).toEqual({
      id: guild,
      contentId: "guild_bakers",
      name: "Bakers' guild",
      factionType: "occupational",
      leaderTitle: "Master Baker",
      disposition: "mercantile",
      leaderId: baker,
      memberIds: [baker],
      standing: [{ factionId: 1, value: -35, tradeAgreement: false }],
      seat: null,
    });
  });

  it("is null for entities that are not factions", () => {
    const { engine, baker } = setup();
    expect(buildFactionView(engine, engine.store.require(baker))).toBeNull();
  });
});

describe("buildMembershipView", () => {
  it("lists the factions of a citizen with names, ascending", () => {
    const { engine, guild, baker } = setup();
    expect(buildMembershipView(engine, baker)).toEqual({
      entityId: baker,
      factions: [
        { id: 1, name: "Settlement" },
        { id: guild, name: "Bakers' guild" },
      ],
    });
    expect(buildMembershipView(engine, guild).factions).toEqual([]);
  });
});
