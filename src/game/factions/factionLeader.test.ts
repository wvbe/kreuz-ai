import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { JsonValue } from "../engine/EventBus";
import { GameEngine } from "../engine/GameEngine";
import { FactionErrorKind } from "./FactionError";
import type { FactionError } from "./FactionError";
import { pickLeaderCandidate, setFactionLeader } from "./factionLeader";
import { joinFaction } from "./factionMembership";
import { factionLeaderChangedEvent } from "./factionTypes";

function setup(): { engine: GameEngine; farmer: number; baker: number; peasant: number } {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed: 7 });
  return {
    engine,
    farmer: engine.store.spawn("farmer").id,
    baker: engine.store.spawn("baker").id,
    peasant: engine.store.spawn("peasant").id,
  };
}

describe("setFactionLeader", () => {
  it("sets and clears the one leader and emits the change", () => {
    const { engine, baker } = setup();
    const events: JsonValue[] = [];
    engine.bus.subscribe(factionLeaderChangedEvent, (payload) => events.push(payload));
    joinFaction(engine, baker, 1);
    expect(setFactionLeader(engine, 1, baker)).toBe(true);
    expect(setFactionLeader(engine, 1, baker)).toBe(false);
    expect(setFactionLeader(engine, 1, null)).toBe(true);
    engine.bus.processQueue();
    expect(events).toEqual([
      { factionId: 1, oldLeaderId: null, newLeaderId: baker },
      { factionId: 1, oldLeaderId: baker, newLeaderId: null },
    ]);
  });

  it("requires a faction and a member", () => {
    const { engine, baker } = setup();
    const kind = (run: () => void): FactionErrorKind | null => {
      try {
        run();
      } catch (error) {
        return (error as FactionError).kind;
      }
      return null;
    };
    expect(kind(() => setFactionLeader(engine, 1, baker))).toBe(FactionErrorKind.NotMember);
    expect(kind(() => setFactionLeader(engine, baker, baker))).toBe(
      FactionErrorKind.UnknownFaction,
    );
  });
});

describe("pickLeaderCandidate", () => {
  it("takes the member with the greatest total skill, ties to the lowest id", () => {
    const { engine, farmer, baker, peasant } = setup();
    expect(pickLeaderCandidate(engine, 1)).toBeNull();
    for (const id of [peasant, baker, farmer]) {
      joinFaction(engine, id, 1);
    }
    const total = (id: number): number =>
      Object.values(
        (engine.store.require(id).components["Skills"] as { values: { [key: string]: number } })
          .values,
      ).reduce((sum, value) => sum + value, 0);
    const expected = [farmer, baker, peasant].reduce((best, id) =>
      total(id) > total(best) ? id : best,
    );
    expect(pickLeaderCandidate(engine, 1)).toBe(expected);
    const twin = engine.store.spawn("farmer").id;
    joinFaction(engine, twin, 1);
    expect(pickLeaderCandidate(engine, 1)).toBe(expected);
  });
});
