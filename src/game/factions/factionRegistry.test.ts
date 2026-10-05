import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { FactionErrorKind } from "./FactionError";
import type { FactionError } from "./FactionError";
import {
  ensureContentFaction,
  findFactionByContentId,
  governmentFactionId,
  listFactions,
  spawnContentFaction,
} from "./factionRegistry";

function setup(): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 7 });
  return engine;
}

describe("governmentFactionId", () => {
  it("is the bootstrap faction entity with its Faction component", () => {
    const engine = setup();
    expect(governmentFactionId(engine)).toBe(1);
    expect(engine.store.require(1).components["Faction"]).toMatchObject({
      contentId: null,
      factionType: "political",
      leaderId: null,
    });
  });

  it("is null before a game exists", () => {
    expect(governmentFactionId(new GameEngine(loadContent(), { entropy: () => 1 }))).toBeNull();
  });
});

describe("spawnContentFaction", () => {
  it("copies name, type, leader title and disposition from the content record", () => {
    const engine = setup();
    const guild = spawnContentFaction(engine, "guild_bakers");
    expect(guild.components["Faction"]).toEqual({
      contentId: "guild_bakers",
      name: "Bakers' guild",
      factionType: "occupational",
      leaderTitle: "Master Baker",
      disposition: "mercantile",
      leaderId: null,
      standing: [],
    });
  });

  it("rejects unknown content factions", () => {
    const engine = setup();
    try {
      spawnContentFaction(engine, "ghosts");
      expect.unreachable();
    } catch (error) {
      expect((error as FactionError).kind).toBe(FactionErrorKind.UnknownFaction);
    }
  });
});

describe("findFactionByContentId", () => {
  it("finds the lowest-id entity bound to a content faction", () => {
    const engine = setup();
    expect(findFactionByContentId(engine, "guild_bakers")).toBeNull();
    const first = spawnContentFaction(engine, "guild_bakers");
    spawnContentFaction(engine, "guild_bakers");
    expect(findFactionByContentId(engine, "guild_bakers")?.id).toBe(first.id);
  });
});

describe("ensureContentFaction", () => {
  it("spawns once and then reuses the entity", () => {
    const engine = setup();
    const first = ensureContentFaction(engine, "guild_bakers");
    expect(ensureContentFaction(engine, "guild_bakers").id).toBe(first.id);
  });
});

describe("listFactions", () => {
  it("lists faction entities ascending", () => {
    const engine = setup();
    const guild = ensureContentFaction(engine, "guild_bakers");
    engine.store.spawn("baker");
    expect(listFactions(engine).map((entity) => entity.id)).toEqual([1, guild.id]);
  });
});
