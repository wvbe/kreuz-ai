import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { GameEngineError, GameEngineErrorKind } from "../engine/GameEngineError";
import { MapSize } from "../map/mapSize";
import { emitSkillWorkCompleted } from "../skills/skillGrowth";
import { registerIdentity } from "./registerIdentity";
import type { IdentityData, IdentityTitleChanged } from "./identityTypes";
import { fullName } from "./nameText";

function startEngine(seed: number): GameEngine {
  const engine = new GameEngine(loadContent(), { entropy: () => 1 });
  engine.newGame({ seed, mapSize: MapSize.Small });
  return engine;
}

function citizens(engine: GameEngine) {
  return engine.store.entities().filter((entity) => entity.components["Identity"] !== undefined);
}

function identityOf(engine: GameEngine, entityId: number): { styledName: string } {
  return engine.getQuery("identity-of")?.run({ entityId } as never, engine) as {
    styledName: string;
  };
}

const stripTimestamp = (text: string): string => text.replace(/"savedAt":"[^"]*"/, "");

describe("registerIdentity", () => {
  it("is part of every engine and idempotent", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(() => registerIdentity(engine)).not.toThrow();
    expect(engine.queryNames()).toContain("identity-of");
    expect(engine.components.has("Identity")).toBe(true);
  });

  it("names the starting settlers of seed 42 deterministically (golden)", () => {
    const engine = startEngine(42);
    expect(
      citizens(engine).map((entity) => [
        entity.id,
        entity.prototype,
        identityOf(engine, entity.id).styledName,
      ]),
    ).toEqual([
      [3, "farmer", "Margery the Farmer"],
      [4, "farmer", "Godiva the Farmer"],
      [5, "carpenter", "Godfrey the Carpenter, Reeve of the Settlement"],
      [6, "baker", "Sibyl the Baker"],
      [7, "peasant", "Amice Thorne"],
      [8, "peasant", "Jocelin Bridge"],
    ]);
  });

  it("gives the same names for the same seed and other names for another seed", () => {
    const names = (seed: number) =>
      citizens(startEngine(seed)).map((entity) => {
        const identity = entity.components["Identity"] as IdentityData;
        return fullName(identity.givenName, identity.byname);
      });
    expect(names(777)).toEqual(names(777));
    expect(names(777)).not.toEqual(names(778));
    expect(new Set(names(777)).size).toBe(6);
  });

  it("answers null for unknown entities and entities without identity", () => {
    const engine = startEngine(42);
    expect(engine.getQuery("identity-of")?.run({ entityId: 999 } as never, engine)).toBeNull();
    expect(engine.getQuery("identity-of")?.run({ entityId: 1 } as never, engine)).toBeNull();
  });

  it("recomputes the title on skill.increased and emits identity.title.changed", () => {
    const engine = startEngine(42);
    const peasant = 7;
    const skills = engine.store.require(peasant).components["Skills"] as {
      values: { [skillId: string]: number };
    };
    skills.values["farming"] = 19_999;
    const events: IdentityTitleChanged[] = [];
    engine.bus.subscribe<IdentityTitleChanged>("identity.title.changed", (payload) =>
      events.push(payload),
    );
    for (let count = 0; count < 3 && events.length === 0; count += 1) {
      emitSkillWorkCompleted(engine.bus, peasant, "farming");
      engine.bus.processQueue();
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.oldTitle).toBeNull();
    expect(events[0]?.newTitle?.noun).toBe("Farmer");
    expect(identityOf(engine, peasant).styledName).toMatch(/ the Farmer$/);
  });

  it("puts the styled name into entity.deleted, offices included", () => {
    const engine = startEngine(42);
    const deleted: { entityId: number; name: string | null }[] = [];
    engine.bus.subscribe("entity.deleted", (payload) =>
      deleted.push(payload as { entityId: number; name: string | null }),
    );
    const leader = 5;
    const leaderName = identityOf(engine, leader).styledName;
    expect(leaderName).toContain("Reeve of the Settlement");
    engine.store.requestDelete(leader);
    engine.store.requestDelete(8);
    engine.tick();
    expect(deleted).toEqual([
      { entityId: 5, prototypeId: "carpenter", name: leaderName },
      { entityId: 8, prototypeId: "peasant", name: "Jocelin Bridge" },
    ]);
  });

  it("round trips identities through save and load and continues the name stream", () => {
    const first = startEngine(42);
    first.bus.processQueue();
    const save = first.saveGame();
    const second = new GameEngine(loadContent(), { entropy: () => 1 });
    second.loadGame(save);
    expect(stripTimestamp(second.saveGame())).toBe(stripTimestamp(save));
    const nextName = (engine: GameEngine) => {
      const entity = engine.store.spawn("peasant");
      return engine.getQuery("identity-of")?.run({ entityId: entity.id } as never, engine);
    };
    expect(nextName(second)).toEqual(nextName(first));
  });

  it("rejects a save that names an unknown name list and keeps the current game", () => {
    const save = startEngine(42).saveGame();
    const target = startEngine(8);
    const tick = target.getTime().tick;
    try {
      target.loadGame(save.replace(/"nameListId":\s*"common_13c"/, '"nameListId":"ghost_list"'));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GameEngineError);
      expect((error as GameEngineError).kind).toBe(GameEngineErrorKind.InitFailed);
      expect((error as GameEngineError).message).toContain('unknown name list "ghost_list"');
    }
    expect(target.getTime().tick).toBe(tick);
  });
});
