import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import type { JsonValue } from "../engine/EventBus";
import { GameEngine } from "../engine/GameEngine";
import { GameEngineError, GameEngineErrorKind } from "../engine/GameEngineError";
import { MapSize } from "../map/mapSize";
import { factionLeaderChangedEvent, factionMembershipChangedEvent } from "./factionTypes";
import { setFactionLeader } from "./factionLeader";
import { joinFaction } from "./factionMembership";
import { spawnContentFaction } from "./factionRegistry";
import { registerFactions } from "./registerFactions";
import { setStanding } from "./factionStanding";

function startEngine(seed: number): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed, mapSize: MapSize.Small });
  return engine;
}

function query(engine: GameEngine, name: string, args: object): JsonValue | undefined {
  return engine.getQuery(name)?.run(args as never, engine);
}

const stripTimestamp = (text: string): string => text.replace(/"savedAt":"[^"]*"/, "");

describe("registerFactions", () => {
  it("is part of every engine and idempotent", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(() => registerFactions(engine)).not.toThrow();
    expect(engine.queryNames()).toEqual(
      expect.arrayContaining(["factions", "faction-of", "members-of"]),
    );
    expect(engine.components.has("Faction")).toBe(true);
    expect(engine.components.has("Citizen")).toBe(true);
  });

  it("makes every starting settler a member of the government, led by one of them", () => {
    const engine = startEngine(42);
    const settlers = engine.store.entities().filter((entity) => entity.components["Citizen"]);
    expect(settlers).toHaveLength(6);
    for (const settler of settlers) {
      expect(query(engine, "faction-of", { entityId: settler.id })).toEqual({
        entityId: settler.id,
        factions: [{ id: 1, name: "Settlement" }],
      });
    }
    expect(query(engine, "members-of", { factionId: 1 })).toEqual({
      factionId: 1,
      memberIds: settlers.map((settler) => settler.id),
    });
    const views = query(engine, "factions", {}) as { id: number; leaderId: number | null }[];
    expect(views.map((view) => view.id)).toEqual([1]);
    expect(settlers.map((settler) => settler.id)).toContain(views[0]?.leaderId);
  });

  it("answers null for unknown entities and non-factions", () => {
    const engine = startEngine(42);
    expect(query(engine, "faction-of", { entityId: 999 })).toBeNull();
    expect(query(engine, "members-of", { factionId: 999 })).toBeNull();
    expect(query(engine, "members-of", { factionId: 3 })).toBeNull();
  });

  it("emits membership and leader events while the world is generated", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    const names: string[] = [];
    engine.bus.subscribe(factionMembershipChangedEvent, () => names.push("membership"));
    engine.bus.subscribe(factionLeaderChangedEvent, () => names.push("leader"));
    engine.newGame({ seed: 3, mapSize: MapSize.Small });
    engine.bus.processQueue();
    expect(names.filter((name) => name === "membership")).toHaveLength(6);
    expect(names.filter((name) => name === "leader")).toHaveLength(1);
  });

  it("cleans dangling references when a leader or a faction is deleted", () => {
    const engine = startEngine(42);
    const leader = (query(engine, "factions", {}) as { leaderId: number }[])[0]?.leaderId as number;
    engine.store.requestDelete(leader);
    engine.tick();
    expect(
      (query(engine, "factions", {}) as { leaderId: number | null }[])[0]?.leaderId,
    ).toBeNull();
    expect(
      (query(engine, "members-of", { factionId: 1 }) as { memberIds: number[] }).memberIds,
    ).not.toContain(leader);
    engine.store.requestDelete(1);
    engine.tick();
    for (const entity of engine.store.entities()) {
      expect(
        (entity.components["Citizen"] as { factions: number[] } | undefined)?.factions ?? [],
      ).toEqual([]);
    }
  });

  it("round trips factions, membership, leaders and standing through save and load", () => {
    const first = startEngine(42);
    const guild = spawnContentFaction(first, "guild_bakers").id;
    const baker = first.store.entities().find((entity) => entity.prototype === "baker")
      ?.id as number;
    joinFaction(first, baker, guild);
    setFactionLeader(first, guild, baker);
    setStanding(first, guild, 1, -45, true);
    setStanding(first, 1, guild, 30);
    first.bus.processQueue();
    const save = first.saveGame();

    const second = new GameEngine(loadContent(), { entropy: () => 1 });
    second.loadGame(save);
    expect(query(second, "factions", {})).toEqual(query(first, "factions", {}));
    expect(query(second, "faction-of", { entityId: baker })).toEqual(
      query(first, "faction-of", { entityId: baker }),
    );
    expect(stripTimestamp(second.saveGame())).toBe(stripTimestamp(first.saveGame()));
  });

  it("rejects a save with a dangling faction reference and keeps the current game", () => {
    const engine = startEngine(42);
    const save = engine.saveGame();
    const target = startEngine(8);
    const tick = target.getTime().tick;
    const kind = (broken: string): string | null => {
      try {
        target.loadGame(broken);
      } catch (error) {
        expect(error).toBeInstanceOf(GameEngineError);
        expect((error as GameEngineError).kind).toBe(GameEngineErrorKind.InitFailed);
        return (error as GameEngineError).message;
      }
      return null;
    };
    expect(kind(save.replace(/"factions":\s*\[\s*1\s*\]/, '"factions":[77]'))).toContain(
      "unknown faction 77",
    );
    expect(kind(save.replace(/"leaderId":\s*\d+/, '"leaderId":2'))).toContain("not a citizen");
    expect(target.getTime().tick).toBe(tick);
  });
});
