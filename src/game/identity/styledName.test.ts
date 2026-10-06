import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { joinFaction } from "../factions/factionMembership";
import { setFactionLeader } from "../factions/factionLeader";
import { ensureContentFaction } from "../factions/factionRegistry";
import { TitleRank } from "./identityTypes";
import type { Title } from "./identityTypes";
import { appointSteward } from "../standing/steward";
import { formatStyledName, officesOf, styledName, stylePartsOf } from "./styledName";

const formats = loadContent().nameFormats;
const baker: Title = {
  skillId: "baking",
  rank: TitleRank.Practitioner,
  noun: "Baker",
  guildId: null,
};
const master: Title = {
  skillId: "baking",
  rank: TitleRank.Master,
  noun: "Baker",
  guildId: "guild_bakers",
};

function parts(overrides: Partial<Parameters<typeof formatStyledName>[1]> = {}) {
  return {
    givenName: "Ansel",
    byname: "atte Brook",
    nameOrdinal: 0,
    title: null,
    offices: [],
    ...overrides,
  };
}

describe("formatStyledName", () => {
  it("formats plain, Practitioner and Master names", () => {
    expect(formatStyledName(formats, parts())).toBe("Ansel atte Brook");
    expect(formatStyledName(formats, parts({ byname: null }))).toBe("Ansel");
    expect(formatStyledName(formats, parts({ title: baker }))).toBe("Ansel the Baker");
    expect(formatStyledName(formats, parts({ title: master }))).toBe("Ansel, Master Baker");
  });

  it("shows the name ordinal as a roman numeral", () => {
    expect(formatStyledName(formats, parts({ nameOrdinal: 2 }))).toBe("Ansel atte Brook II");
    expect(formatStyledName(formats, parts({ nameOrdinal: 3, title: baker }))).toBe(
      "Ansel III the Baker",
    );
  });

  it("appends offices, using the short form when the leader title equals the Master title", () => {
    const guild = { factionId: 4, factionName: "Bakers' guild", leaderTitle: "Master Baker" };
    const reeve = { factionId: 1, factionName: "Settlement", leaderTitle: "Reeve" };
    expect(formatStyledName(formats, parts({ title: master, offices: [guild] }))).toBe(
      "Ansel, Master Baker of the Bakers' guild",
    );
    expect(formatStyledName(formats, parts({ title: baker, offices: [guild] }))).toBe(
      "Ansel the Baker, Master Baker of the Bakers' guild",
    );
    expect(formatStyledName(formats, parts({ offices: [reeve, guild] }))).toBe(
      "Ansel atte Brook, Reeve of the Settlement, Master Baker of the Bakers' guild",
    );
  });
});

describe("officesOf, stylePartsOf and styledName", () => {
  function setup() {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 7 });
    const guild = ensureContentFaction(engine, "guild_bakers").id;
    const peasant = engine.store.spawn("peasant").id;
    joinFaction(engine, peasant, guild);
    joinFaction(engine, peasant, 1);
    return { engine, guild, peasant };
  }

  it("lists the led factions ascending and builds the styled name", () => {
    const { engine, guild, peasant } = setup();
    const entity = engine.store.require(peasant);
    const identity = entity.components["Identity"] as { givenName: string; byname: string | null };
    identity.givenName = "Odo";
    identity.byname = "Thorne";
    expect(officesOf(engine, peasant)).toEqual([]);
    expect(styledName(engine, entity)).toBe("Odo Thorne");
    setFactionLeader(engine, guild, peasant);
    setFactionLeader(engine, 1, peasant);
    expect(officesOf(engine, peasant)).toEqual([
      { factionId: 1, factionName: "Settlement", leaderTitle: "Reeve" },
      { factionId: guild, factionName: "Bakers' guild", leaderTitle: "Master Baker" },
    ]);
    expect(
      stylePartsOf(engine, entity, entity.components["Identity"] as never).offices,
    ).toHaveLength(2);
    expect(styledName(engine, entity)).toBe(
      "Odo Thorne, Reeve of the Settlement, Master Baker of the Bakers' guild",
    );
  });

  it("adds the Steward's office of the government after the led factions", () => {
    const { engine, peasant } = setup();
    const entity = engine.store.require(peasant);
    const identity = entity.components["Identity"] as { givenName: string; byname: string | null };
    identity.givenName = "Odo";
    identity.byname = "Thorne";
    appointSteward(engine, peasant);
    expect(officesOf(engine, peasant)).toEqual([
      { factionId: 1, factionName: "Settlement", leaderTitle: "Steward" },
    ]);
    setFactionLeader(engine, 1, peasant);
    expect(styledName(engine, entity)).toBe(
      "Odo Thorne, Reeve of the Settlement, Steward of the Settlement",
    );
  });

  it("is null for entities without identity", () => {
    const { engine } = setup();
    expect(styledName(engine, engine.store.require(1))).toBeNull();
  });
});
