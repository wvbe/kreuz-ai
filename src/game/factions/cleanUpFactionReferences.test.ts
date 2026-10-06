import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { JsonValue } from "../engine/EventBus";
import { GameEngine } from "../engine/GameEngine";
import { setFactionLeader } from "./factionLeader";
import { factionsOf, joinFaction } from "./factionMembership";
import { spawnContentFaction } from "./factionRegistry";
import { getStanding, setStanding } from "./factionStanding";
import { factionLeaderChangedEvent, factionMembershipChangedEvent } from "./factionTypes";

function setup(): { engine: GameEngine; guild: number; baker: number; peasant: number } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 7 });
  const guild = spawnContentFaction(engine, "guild_bakers").id;
  const baker = engine.store.spawn("baker").id;
  const peasant = engine.store.spawn("peasant").id;
  for (const id of [baker, peasant]) {
    joinFaction(engine, id, 1);
    joinFaction(engine, id, guild);
  }
  setFactionLeader(engine, guild, baker);
  setStanding(engine, 1, guild, 20);
  setStanding(engine, guild, 1, -10);
  engine.bus.processQueue();
  return { engine, guild, baker, peasant };
}

// @covers 021:FR-003 021:SC-004
describe("cleanUpFactionReferences", () => {
  it("empties leaderId of a deleted leader and emits the change", () => {
    const { engine, guild, baker } = setup();
    const events: JsonValue[] = [];
    engine.bus.subscribe(factionLeaderChangedEvent, (payload) => {
      if ((payload as { factionId: number }).factionId === guild) {
        events.push(payload);
      }
    });
    engine.store.requestDelete(baker);
    engine.tick();
    expect(engine.store.get(baker)).toBeUndefined();
    expect(
      (engine.store.require(guild).components["Faction"] as { leaderId: number | null }).leaderId,
    ).toBeNull();
    expect(events).toEqual([{ factionId: guild, oldLeaderId: baker, newLeaderId: null }]);
  });

  it("removes a deleted faction from member lists and other factions' standing", () => {
    const { engine, guild, baker, peasant } = setup();
    const events: JsonValue[] = [];
    engine.bus.subscribe(factionMembershipChangedEvent, (payload) => events.push(payload));
    engine.store.requestDelete(guild);
    engine.tick();
    expect(factionsOf(engine, baker)).toEqual([1]);
    expect(factionsOf(engine, peasant)).toEqual([1]);
    expect(getStanding(engine, 1, guild).value).toBe(0);
    expect(
      (engine.store.require(1).components["Faction"] as { standing: object[] }).standing,
    ).toEqual([]);
    expect(events).toEqual([
      { entityId: baker, factionId: guild, joined: false },
      { entityId: peasant, factionId: guild, joined: false },
    ]);
  });

  it("leaves everything alone when an ordinary member is deleted", () => {
    const { engine, guild, peasant } = setup();
    engine.store.requestDelete(peasant);
    engine.tick();
    expect(getStanding(engine, 1, guild).value).toBe(20);
    expect(engine.errors).toEqual([]);
  });
});
