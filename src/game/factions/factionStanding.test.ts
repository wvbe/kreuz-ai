import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { JsonValue } from "../engine/EventBus";
import { GameEngine } from "../engine/GameEngine";
import { FactionError, FactionErrorKind } from "./FactionError";
import { spawnContentFaction } from "./factionRegistry";
import { clampStanding, getStanding, setStanding } from "./factionStanding";
import { attitudeChangedEvent, standingChangedEvent } from "./factionTypes";

function setup(): { engine: GameEngine; government: number; guild: number } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 7 });
  return { engine, government: 1, guild: spawnContentFaction(engine, "guild_bakers").id };
}

describe("clampStanding", () => {
  it("clamps to -100..100", () => {
    expect(clampStanding(250)).toBe(100);
    expect(clampStanding(-250)).toBe(-100);
    expect(clampStanding(37)).toBe(37);
  });
});

describe("getStanding", () => {
  it("defaults to 0 without agreement and throws for non-factions", () => {
    const { engine, government, guild } = setup();
    expect(getStanding(engine, government, guild)).toEqual({
      factionId: guild,
      value: 0,
      tradeAgreement: false,
    });
    expect(() => getStanding(engine, 999, guild)).toThrow(FactionError);
    try {
      getStanding(engine, 999, guild);
    } catch (error) {
      expect((error as FactionError).kind).toBe(FactionErrorKind.UnknownFaction);
    }
  });
});

describe("setStanding", () => {
  it("is asymmetric, clamped, sorted and emits the change", () => {
    const { engine, government, guild } = setup();
    const events: JsonValue[] = [];
    engine.bus.subscribe(standingChangedEvent, (payload) => events.push(payload));
    expect(setStanding(engine, government, guild, 250).value).toBe(100);
    expect(getStanding(engine, guild, government).value).toBe(0);
    setStanding(engine, government, guild, -60, true);
    setStanding(engine, government, guild, -60);
    engine.bus.processQueue();
    expect(getStanding(engine, government, guild)).toEqual({
      factionId: guild,
      value: -60,
      tradeAgreement: true,
    });
    expect(events).toEqual([
      { factionId: government, otherFactionId: guild, oldValue: 0, newValue: 100 },
      { factionId: government, otherFactionId: guild, oldValue: 100, newValue: -60 },
    ]);
  });

  it("keeps entries ascending by faction id and drops an entry back at the default", () => {
    const { engine, government, guild } = setup();
    const third = spawnContentFaction(engine, "guild_bakers").id;
    setStanding(engine, government, third, 5);
    setStanding(engine, government, guild, 7);
    const standing = (
      engine.store.require(government).components["Faction"] as {
        standing: { factionId: number }[];
      }
    ).standing;
    expect(standing.map((entry) => entry.factionId)).toEqual([guild, third]);
    setStanding(engine, government, guild, 0);
    expect(
      (engine.store.require(government).components["Faction"] as { standing: object[] }).standing,
    ).toHaveLength(1);
  });

  it("queues diplomacy.attitude.changed only when the value moves into another band", () => {
    const { engine, government, guild } = setup();
    const events: JsonValue[] = [];
    engine.bus.subscribe(attitudeChangedEvent, (payload) => events.push(payload));
    setStanding(engine, government, guild, 5);
    setStanding(engine, government, guild, 19);
    setStanding(engine, government, guild, 20);
    setStanding(engine, government, guild, -31);
    engine.bus.processQueue();
    expect(events).toEqual([
      {
        factionId: government,
        otherFactionId: guild,
        oldAttitude: "neutral",
        newAttitude: "friendly",
      },
      {
        factionId: government,
        otherFactionId: guild,
        oldAttitude: "friendly",
        newAttitude: "hostile",
      },
    ]);
  });
});
