import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/api/GameSession";
import { formatScenarioResult } from "../../src/game/api/scenario/formatScenarioResult";
import { runScenario } from "../../src/game/api/scenario/runScenario";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import type { Scenario } from "../../src/game/api/scenario/Scenario";
import { ContentFile, SettlementTier } from "../../src/game/content/contentTypes";
import { bundledContentFiles, loadContentPack } from "../../src/game/content/ContentLoader";
import type { ContentRegistries } from "../../src/game/content/ContentRegistries";
import { Difficulty } from "../../src/game/save/initOptions";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { joinFaction } from "../../src/game/factions/factionMembership";
import { governmentFactionId } from "../../src/game/factions/factionRegistry";
import { getAiService } from "../../src/game/ai/aiServiceRegistry";
import { getDiplomacyService } from "../../src/game/diplomacy/diplomacyServiceRegistry";
import { MapSize } from "../../src/game/map/mapSize";
import { getSettlementService } from "../../src/game/settlement/settlementServiceRegistry";
import { validateTierReachability } from "../../src/game/settlement/validateTierReachability";
import { loadContent } from "../../src/game/content/ContentLoader";
import { loadVillageBakeryContent } from "../../src/game/content/loadVillageBakeryContent";

// Task 4.4 acceptance (spec 027): the tier ladder with its requirements, locked content at every
// gate, difficulty that changes only decay and hostility, startingTier, save/load and the
// reachability proof. scenarios/tier-progress.json is the player-commands-only opening.

const dayTicks = 288;
const scenarioPath = join(__dirname, "..", "..", "scenarios", "tier-progress.json");

function loadScenario(): Scenario {
  const parsed = parseScenario(readFileSync(scenarioPath, "utf8"));
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  return parsed.scenario;
}

function newSession(
  options: { [name: string]: JsonValue },
  content?: ContentRegistries,
): GameSession {
  const session = new GameSession(content);
  const result = session.newGame({ seed: 42, mapSize: MapSize.Small, ...options });
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return session;
}

function lockedPack(): ContentRegistries {
  // the bakery chain is Village content (as before D-54) and the ore job unlocks at Village
  const village = loadVillageBakeryContent();
  expect(village.furniture.require("oven").unlockTier).toBe(SettlementTier.Village);
  const jobs = bundledContentFiles[ContentFile.Jobs];
  const files = {
    ...bundledContentFiles,
    [ContentFile.Furniture]: patchTier(bundledContentFiles[ContentFile.Furniture], "oven"),
    [ContentFile.Zones]: patchTier(bundledContentFiles[ContentFile.Zones], "bakery"),
    [ContentFile.Recipes]: patchTier(bundledContentFiles[ContentFile.Recipes], "bake_bread"),
    [ContentFile.Jobs]: patchTier(jobs, "mine.ore"),
  };
  return loadContentPack(files);
}

function patchTier(records: JsonValue | undefined, id: string): JsonValue[] {
  if (!Array.isArray(records)) {
    throw new Error("not a list");
  }
  return records.map((record) =>
    typeof record === "object" && record !== null && !Array.isArray(record) && record["id"] === id
      ? { ...record, unlockTier: SettlementTier.Village }
      : record,
  );
}

/**
 * Runs a command handler at once and returns the refusal: the error message and its kind.
 */
function refusal(
  session: GameSession,
  kind: string,
  payload: { [name: string]: JsonValue },
): string {
  try {
    session.engine.getCommandHandler(kind)?.handler(payload, session.engine);
  } catch (failure) {
    const detail = failure as { message: string; kind: string };
    return `${detail.message} ${detail.kind}`;
  }
  return "accepted";
}

function count(session: GameSession, query: string): number {
  const result = session.query.run(query, {});
  return result.ok && Array.isArray(result.data) ? result.data.length : -1;
}

function stateWithoutOptions(session: GameSession): string {
  const parsed: JsonValue = JSON.parse(session.engine.saveGame());
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("a save is an object");
  }
  const rest: { [key: string]: JsonValue } = { ...parsed };
  delete rest["initOptions"];
  delete rest["eventQueue"];
  return JSON.stringify(rest);
}

describe("settlement tiers: the scripted opening (seed 42, Small, player commands only)", () => {
  // the scenario itself is run (passes, deterministic) by tests/e2e/scenarios.test.ts; this plays
  // it once with a plain session (no debug spawn) and continues from its end state
  it("passes with real commands only, then promotes to Village on the next day boundary once population and dwellings are there", () => {
    expect(readFileSync(scenarioPath, "utf8")).not.toContain("debugSpawn");
    const created: GameSession[] = [];
    const result = runScenario(loadScenario(), {
      createSession: () => {
        const session = new GameSession();
        created.push(session);
        return session;
      },
    });
    expect(formatScenarioResult(result)).toMatch(/^PASS tier-progress/);
    const session = created[0] as GameSession;
    const engine = session.engine;
    const events: JsonValue[] = [];
    engine.bus.subscribe("settlement.tier.reached", (payload: JsonValue) => {
      events.push(payload);
    });
    // what 4.5 will provide: two more settlers (immigration) and four hovels (the housing hook)
    const government = governmentFactionId(engine) ?? 0;
    for (const cell of [60, 61]) {
      const settler = engine.store.spawn("peasant", {
        Position: { mapId: 1, cellIndex: cell },
      });
      engine.maps.placeEntity(settler.id, 1, cell);
      joinFaction(engine, settler.id, government);
    }
    getSettlementService(engine).setDwellingCounter(() => 4);
    session.step(dayTicks);
    expect(events).toEqual([{ tier: "village", previousTier: "hamlet", tick: 15 * dayTicks }]);
    const view = session.query.run("settlement-progress", {});
    expect(view.ok && (view.data as { tier: string }).tier).toBe("village");
    // the next tier is Market Town: population 20, eight cottages, a guild
    expect(view.ok && (view.data as { nextTier: string }).nextTier).toBe("market_town");
    const unlocks = session.query.run("unlocks", { tier: "village" });
    expect(unlocks.ok && (unlocks.data as { unlocked: boolean }[])[0]?.unlocked).toBe(true);
  }, 180_000);
});

describe("settlement tiers: locked content is rejected at every gate and opens with the tier", () => {
  it("rejects a locked building, zone and recipe with the reason and creates nothing", () => {
    const session = newSession({}, lockedPack());
    const rejected: JsonValue[] = [];
    session.engine.bus.subscribe("command.rejected", (payload: JsonValue) => {
      rejected.push(payload);
    });
    for (const command of [
      { kind: "PlaceFurniture", furnitureId: "oven", mapId: 1, cell: 326 },
      { kind: "DesignateZone", zoneTypeId: "bakery", mapId: 1, cells: [326, 327] },
      { kind: "CreateProductionOrder", recipeId: "bake_bread", quantity: 1 },
    ]) {
      expect(session.dispatch(command).ok).toBe(true);
    }
    session.step(1);
    expect(rejected).toHaveLength(3);
    const reasons = [
      refusal(session, "PlaceFurniture", { furnitureId: "oven", mapId: 1, cell: 326 }),
      refusal(session, "DesignateZone", { zoneTypeId: "bakery", mapId: 1, cells: [326, 327] }),
      refusal(session, "CreateProductionOrder", { recipeId: "bake_bread", quantity: 1 }),
    ];
    expect(reasons[0]).toContain("Unlocks at Village");
    expect(reasons[1]).toContain("needs the tier village");
    expect(reasons[2]).toContain("needs tier village");
    expect(reasons.every((reason) => reason.endsWith("content-locked"))).toBe(true);
    expect(count(session, "zones")).toBe(0);
    expect(count(session, "production-orders")).toBe(0);
    const queue = session.query.run("construction-queue", {});
    expect(queue.ok && (queue.data as { jobs: unknown[] }).jobs).toHaveLength(0);
    const placement = session.query.run("validate-placement", {
      prototypeId: "oven",
      mapId: 1,
      cellIndex: 326,
    });
    expect(placement.ok && JSON.stringify(placement.data)).toContain("Unlocks at Village");
    const menu = session.query.run("build-menu", {});
    expect(menu.ok && JSON.stringify(menu.data)).toContain("Unlocks at Village");
  });

  it("keeps locked content registered, browsable and tradeable", () => {
    const session = newSession({}, lockedPack());
    const unlocks = session.query.run("unlocks", { lockedOnly: true });
    expect(unlocks.ok).toBe(true);
    const ids = (unlocks.ok ? (unlocks.data as { contentId: string }[]) : []).map(
      (row) => row.contentId,
    );
    expect(ids).toEqual(expect.arrayContaining(["oven", "bakery", "bake_bread", "mine.ore"]));
    expect(session.engine.content.furniture.has("oven")).toBe(true);
  });

  it("opens the gates as soon as the tier is reached", () => {
    const session = newSession({}, lockedPack());
    const rejected: JsonValue[] = [];
    session.engine.bus.subscribe("command.rejected", (payload: JsonValue) => {
      rejected.push(payload);
    });
    session.dispatch({ kind: "CreateProductionOrder", recipeId: "bake_bread", quantity: 1 });
    session.step(1);
    expect(rejected).toHaveLength(1);
    getSettlementService(session.engine).setTier(SettlementTier.Village);
    session.dispatch({ kind: "DesignateZone", zoneTypeId: "bakery", mapId: 1, cells: [326, 327] });
    session.step(1);
    expect(rejected).toHaveLength(1);
    expect(count(session, "zones")).toBe(1);
  });

  it("starts at a given tier with its content unlocked, no tier event and no milestone", () => {
    const events: string[] = [];
    const session = new GameSession(lockedPack());
    session.engine.bus.subscribe("settlement.**", (_payload, event) => {
      events.push(event.name);
    });
    session.newGame({ seed: 42, mapSize: MapSize.Small, startingTier: "village" });
    session.step(10);
    expect(events).toEqual([]);
    const view = session.query.run("settlement-progress", {});
    expect(view.ok && (view.data as { tier: string }).tier).toBe("village");
    const locked = session.query.run("unlocks", { lockedOnly: true });
    expect(
      locked.ok && (locked.data as { contentId: string }[]).map((row) => row.contentId),
    ).toEqual(["timber_framed_house", "burgher_house"]);
    const milestones = session.query.run("milestones", {});
    expect(
      milestones.ok && (milestones.data as { reached: boolean }[]).some((row) => row.reached),
    ).toBe(false);
    session.dispatch({ kind: "DesignateZone", zoneTypeId: "bakery", mapId: 1, cells: [326, 327] });
    session.step(1);
    expect(count(session, "zones")).toBe(1);
  });
});

describe("difficulty changes only decay, need decay and hostility", () => {
  it("gives the same map and entities at tick 0 whatever the difficulty (only initOptions differ)", () => {
    const sessions = [Difficulty.Peaceful, Difficulty.Steady, Difficulty.Harsh].map((difficulty) =>
      newSession({ difficulty }),
    );
    const states = sessions.map(stateWithoutOptions);
    expect(states[1]).toBe(states[0]);
    expect(states[2]).toBe(states[0]);
    const options = sessions.map((session) => session.engine.getState().initOptions.difficulty);
    expect(options).toEqual(["peaceful", "steady", "harsh"]);
    expect(new Set(sessions.map((session) => session.engine.getStateHash())).size).toBe(3);
  });

  it("feeds the multipliers of the difficulty to need decay and to NPC hostility", () => {
    const read = (difficulty: Difficulty): number[] => {
      const engine = newSession({ difficulty }).engine;
      return [
        getAiService(engine).needDecayMultiplierPermille(),
        getDiplomacyService(engine).hostilityMultiplierMilli(),
      ];
    };
    expect(read(Difficulty.Peaceful)).toEqual([700, 250]);
    expect(read(Difficulty.Steady)).toEqual([1000, 1000]);
    expect(read(Difficulty.Harsh)).toEqual([1300, 1500]);
  });

  it("scales item decay by the difficulty: 0.5, 1.0 and 1.5 of the steady rate", () => {
    const remaining = (difficulty: Difficulty): number => {
      const engine = newSession({ difficulty }).engine;
      const before = breadRemaining(engine);
      engine.runTicks(20);
      return before - breadRemaining(engine);
    };
    const peaceful = remaining(Difficulty.Peaceful);
    const steady = remaining(Difficulty.Steady);
    const harsh = remaining(Difficulty.Harsh);
    expect(peaceful).toBeGreaterThan(0);
    expect(steady).toBe(peaceful * 2);
    expect(harsh).toBe(peaceful * 3);
  });
});

function breadRemaining(engine: GameSession["engine"]): number {
  let total = 0;
  for (const entity of engine.store.entities()) {
    const inventory = entity.components["Inventory"];
    const slots = inventory?.["slots"];
    if (Array.isArray(slots)) {
      for (const slot of slots) {
        if (
          typeof slot === "object" &&
          slot !== null &&
          !Array.isArray(slot) &&
          slot["materialId"] === "bread"
        ) {
          total += Number(slot["remainingMilli"]) * Number(slot["quantity"] ?? 1);
        }
      }
    }
  }
  return total;
}

describe("settlement state survives save and load", () => {
  it("keeps the tier, reach ticks and milestones and re-emits nothing after a load", () => {
    const session = newSession({ startingTier: "village" });
    const engine = session.engine;
    engine.bus.emit("zone.requirements.met", { zoneId: 5, zoneTypeId: "market" });
    session.step(3);
    const events: string[] = [];
    engine.bus.subscribe("settlement.**", (_payload, event) => {
      events.push(event.name);
    });
    const saved = engine.saveGame();
    const hash = engine.getStateHash();
    engine.loadGame(saved);
    expect(engine.getStateHash()).toBe(hash);
    session.step(dayTicks);
    expect(events).toEqual([]);
    const view = session.query.run("settlement-progress", {});
    expect(
      view.ok && (view.data as { tier: string; tierReachedAtTick: unknown }).tierReachedAtTick,
    ).toEqual({
      hamlet: 0,
      village: 0,
    });
    const milestones = session.query.run("milestones", {});
    expect(
      milestones.ok &&
        (milestones.data as { milestone: string; reached: boolean }[])
          .filter((row) => row.reached)
          .map((row) => row.milestone),
    ).toEqual(["first-market"]);
  });
});

describe("tier reachability of the shipped pack", () => {
  it("proves Village (and every later tier) reachable from a Hamlet start", () => {
    expect(validateTierReachability(loadContent())).toEqual([]);
  });
});
