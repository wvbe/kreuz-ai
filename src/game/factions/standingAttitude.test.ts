import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { Attitude } from "./attitudeBands";
import { spawnContentFaction } from "./factionRegistry";
import { setStanding } from "./factionStanding";
import { getAttitude, isHostilePair } from "./standingAttitude";

function setup(): { engine: GameEngine; government: number; guild: number } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 7 });
  return { engine, government: 1, guild: spawnContentFaction(engine, "guild_bakers").id };
}

describe("getAttitude", () => {
  it("is neutral by default and follows each side's own standing", () => {
    const { engine, government, guild } = setup();
    expect(getAttitude(engine, government, guild)).toBe(Attitude.Neutral);
    setStanding(engine, government, guild, -12);
    setStanding(engine, guild, government, 45);
    expect(getAttitude(engine, government, guild)).toBe(Attitude.Wary);
    expect(getAttitude(engine, guild, government)).toBe(Attitude.Friendly);
  });
});

describe("isHostilePair", () => {
  it("is true when either view is below -30, false at exactly -30", () => {
    const { engine, government, guild } = setup();
    expect(isHostilePair(engine, government, guild)).toBe(false);
    setStanding(engine, guild, government, -30);
    expect(isHostilePair(engine, government, guild)).toBe(false);
    setStanding(engine, guild, government, -31);
    expect(isHostilePair(engine, government, guild)).toBe(true);
    expect(isHostilePair(engine, guild, government)).toBe(true);
    setStanding(engine, guild, government, 0);
    setStanding(engine, government, guild, -60);
    expect(isHostilePair(engine, government, guild)).toBe(true);
  });
});
