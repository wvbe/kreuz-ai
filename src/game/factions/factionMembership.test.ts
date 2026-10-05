import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { JsonValue } from "../engine/EventBus";
import { GameEngine } from "../engine/GameEngine";
import { FactionErrorKind } from "./FactionError";
import type { FactionError } from "./FactionError";
import { factionsOf, isMember, joinFaction, leaveFaction, membersOf } from "./factionMembership";
import { spawnContentFaction } from "./factionRegistry";
import { factionMembershipChangedEvent } from "./factionTypes";

function setup(): { engine: GameEngine; government: number; guild: number; citizens: number[] } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 7 });
  const guild = spawnContentFaction(engine, "guild_bakers").id;
  const citizens = [engine.store.spawn("baker").id, engine.store.spawn("peasant").id];
  return { engine, government: 1, guild, citizens };
}

describe("joinFaction", () => {
  it("adds a citizen to several factions, ascending, and emits the change once each", () => {
    const { engine, government, guild, citizens } = setup();
    const events: JsonValue[] = [];
    engine.bus.subscribe(factionMembershipChangedEvent, (payload) => events.push(payload));
    const citizen = citizens[0] as number;
    expect(joinFaction(engine, citizen, guild)).toBe(true);
    expect(joinFaction(engine, citizen, government)).toBe(true);
    expect(joinFaction(engine, citizen, government)).toBe(false);
    engine.bus.processQueue();
    expect(factionsOf(engine, citizen)).toEqual([government, guild]);
    expect(events).toEqual([
      { entityId: citizen, factionId: guild, joined: true },
      { entityId: citizen, factionId: government, joined: true },
    ]);
  });

  it("rejects non-citizens and non-factions", () => {
    const { engine, government, citizens } = setup();
    const failure = (run: () => void): Error | null => {
      try {
        run();
      } catch (error) {
        return error as Error;
      }
      return null;
    };
    const notCitizen = failure(() => joinFaction(engine, government, government));
    expect((notCitizen as FactionError).kind).toBe(FactionErrorKind.NotCitizen);
    const notFaction = failure(() =>
      joinFaction(engine, citizens[0] as number, citizens[1] as number),
    );
    expect((notFaction as FactionError).kind).toBe(FactionErrorKind.UnknownFaction);
  });
});

describe("leaveFaction", () => {
  it("removes the membership and emits the change; leaving twice does nothing", () => {
    const { engine, government, citizens } = setup();
    const citizen = citizens[0] as number;
    joinFaction(engine, citizen, government);
    engine.bus.processQueue();
    const events: JsonValue[] = [];
    engine.bus.subscribe(factionMembershipChangedEvent, (payload) => events.push(payload));
    expect(leaveFaction(engine, citizen, government)).toBe(true);
    expect(leaveFaction(engine, citizen, government)).toBe(false);
    engine.bus.processQueue();
    expect(factionsOf(engine, citizen)).toEqual([]);
    expect(events).toEqual([{ entityId: citizen, factionId: government, joined: false }]);
  });
});

describe("factionsOf", () => {
  it("is empty for unknown entities and non-citizens", () => {
    const { engine, government } = setup();
    expect(factionsOf(engine, 999)).toEqual([]);
    expect(factionsOf(engine, government)).toEqual([]);
  });
});

describe("membersOf", () => {
  it("derives the members from Citizen.factions only, ascending", () => {
    const { engine, government, guild, citizens } = setup();
    joinFaction(engine, citizens[1] as number, government);
    joinFaction(engine, citizens[0] as number, government);
    joinFaction(engine, citizens[0] as number, guild);
    expect(membersOf(engine, government).map((entity) => entity.id)).toEqual(citizens);
    expect(membersOf(engine, guild).map((entity) => entity.id)).toEqual([citizens[0]]);
    expect(engine.store.require(guild).components["Faction"]).not.toHaveProperty("members");
  });
});

describe("isMember", () => {
  it("tells membership", () => {
    const { engine, government, guild, citizens } = setup();
    joinFaction(engine, citizens[0] as number, government);
    expect(isMember(engine, citizens[0] as number, government)).toBe(true);
    expect(isMember(engine, citizens[0] as number, guild)).toBe(false);
    expect(isMember(engine, 999, government)).toBe(false);
  });
});
