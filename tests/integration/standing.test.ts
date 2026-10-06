import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameSession } from "../../src/game/api/GameSession";
import { createScenarioSession } from "../../src/game/api/scenario/createScenarioSession";
import { formatScenarioResult } from "../../src/game/api/scenario/formatScenarioResult";
import { runScenario } from "../../src/game/api/scenario/runScenario";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import type { Scenario } from "../../src/game/api/scenario/Scenario";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { findSeat } from "../../src/game/standing/findSeat";
import { ticksPerDay } from "../../src/game/time/GameTime";

// Task 4.3 acceptance (spec 026, DECISIONS D-19 and D-59): standing orders keep bread and flour in
// stock without a manual order for either, a Steward reviews once a day at tick 72, the runs are
// delivered by the Town Crier, and a save at any point resumes identically.

type Seen = { tick: number; name: string; payload: JsonValue };

const longTimeout = 120_000;
const scenarioPath = join(__dirname, "..", "..", "scenarios", "standing-orders.json");

function loadScenario(): Scenario {
  const parsed = parseScenario(readFileSync(scenarioPath, "utf8"));
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  return parsed.scenario;
}

function field(payload: JsonValue, name: string): JsonValue | undefined {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload[name]
    : undefined;
}

// The scenario's setup commands and steps up to (not including) the saveLoad step, applied to a
// session, then `ticks` more; used to compare saved and unsaved games at chosen ticks.
function playTo(session: GameSession, scenario: Scenario, tick: number): void {
  session.newGame({ seed: scenario.seed, ...(scenario.options as { mapSize: 0 }) });
  for (const step of scenario.steps) {
    const command = step["command"];
    if (typeof command === "object" && command !== null && !Array.isArray(command)) {
      session.dispatch({ ...command, kind: String(command["kind"]) });
    } else if (typeof step["step"] === "number") {
      const left = tick - session.engine.time.tickCount;
      session.step(Math.min(step["step"], Math.max(0, left)));
    }
    if (session.engine.time.tickCount >= tick) {
      return;
    }
  }
}

// One full run of the scenario. The scenario's last step replays the command log into a second
// session; `events` and `session` are those of the first one, the run itself.
function play(): { result: string; events: Seen[]; session: GameSession } {
  const runs: { events: Seen[]; session: GameSession }[] = [];
  const result = runScenario(loadScenario(), {
    createSession: () => {
      const session = createScenarioSession();
      const events: Seen[] = [];
      session.engine.bus.subscribe("**", (payload, event) => {
        events.push({ tick: session.engine.time.tickCount, name: event.name, payload });
      });
      runs.push({ events, session });
      return session;
    },
  });
  const first = runs[0] as (typeof runs)[number];
  return { result: formatScenarioResult(result), events: first.events, session: first.session };
}

describe("standing-orders scenario (task 4.3, spec 026)", () => {
  const run = play();

  it("passes its own assertions", () => {
    expect(run.result).toMatch(/^PASS standing-orders/);
  });

  it("keeps bread and flour with standing orders and one manual order for stone only", () => {
    const kinds = loadScenario().steps.flatMap((step) => {
      const command = step["command"];
      return typeof command === "object" && command !== null && !Array.isArray(command)
        ? [command]
        : [];
    });
    const manual = kinds.filter((command) => command["kind"] === "CreateProductionOrder");
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ recipeId: "cut_stone_block" });
    expect(kinds.filter((command) => command["kind"] === "CreateStandingOrder")).toHaveLength(2);
    expect(kinds.some((command) => command["kind"] === "AppointSteward")).toBe(true);
    expect(loadScenario().steps.some((step) => "debugSpawn" in step)).toBe(false);
  });

  // @covers 026:FR-008
  it("reviews once a day at tick of day 72, and the first review comes with the throne room", () => {
    const completed = run.events.filter((event) => event.name === "steward.review.completed");
    expect(completed.length).toBeGreaterThanOrEqual(4);
    for (const event of completed) {
      expect(event.tick % ticksPerDay).toBe(72);
      expect(field(event.payload, "ordersEvaluated")).toBe(2);
    }
    expect(completed.map((event) => event.tick)).toEqual([
      ...new Set(completed.map((event) => event.tick)),
    ]);
    const skipped = run.events.filter((event) => event.name === "steward.review.skipped");
    expect(skipped.every((event) => field(event.payload, "reason") === "NoSeatOfGovernment")).toBe(
      true,
    );
  });

  // @covers 026:SC-001
  it("starts restocking, queues runs and delivers them by crier (via TownCrier)", () => {
    const started = run.events.filter((event) => event.name === "standing-order.restock.started");
    expect(started.length).toBeGreaterThanOrEqual(2);
    const delivered = run.events.filter((event) => event.name === "jobboard.update.applied");
    expect(delivered.length).toBeGreaterThan(5);
    expect(delivered.every((event) => field(event.payload, "via") === "TownCrier")).toBe(true);
  });

  // @covers 026:SC-001
  it("makes every bread and flour production order out of a Steward run", () => {
    const created = run.events.filter((event) => event.name === "production.order.created");
    const food = created.filter((event) => {
      const recipe = field(event.payload, "recipeId");
      return recipe === "bake_bread" || recipe === "grind_flour";
    });
    expect(food.length).toBeGreaterThan(5);
    const firstReview = run.events.find((event) => event.name === "steward.review.completed");
    expect(food.every((event) => event.tick >= (firstReview?.tick ?? Infinity))).toBe(true);
  });

  it("sends the Steward to the throne room for an audience after each review", () => {
    const audiences = run.events.filter(
      (event) =>
        event.name === "task.finished" &&
        field(event.payload, "taskType") === "govern.steward_audience" &&
        field(event.payload, "entityId") === 3,
    );
    expect(audiences.length).toBeGreaterThanOrEqual(3);
    expect(audiences.every((event) => field(event.payload, "outcome") === "Completed")).toBe(true);
    expect(findSeat(run.session.engine)).not.toBeNull();
  });

  it("explains every order and leaves nothing unexplained", () => {
    const view = run.session.query.run("idle-blocked", { includeUnsettled: true });
    const rows = view.ok && Array.isArray(view.data) ? view.data : [];
    expect(rows.filter((row) => JSON.stringify(row).includes("Unexplained"))).toEqual([]);
    const orders = run.session.query.run("standing-orders", {});
    expect(orders.ok && Array.isArray(orders.data) ? orders.data.length : 0).toBe(2);
  });

  // @covers 026:SC-005
  it(
    "resumes identically from a save at every phase: before the throne room, with runs on the way, in flight",
    () => {
      const scenario = loadScenario();
      for (const tick of [100, 649, 700, 1000, 1304]) {
        const original = createScenarioSession();
        playTo(original, scenario, tick);
        expect(original.engine.time.tickCount).toBe(tick);
        const text = original.engine.saveGame();
        const copy = createScenarioSession();
        copy.engine.loadGame(text);
        expect(copy.engine.getStateHash()).toBe(original.engine.getStateHash());
        original.step(300);
        copy.step(300);
        expect(copy.engine.getStateHash()).toBe(original.engine.getStateHash());
        expect(copy.engine.saveGame()).toBe(original.engine.saveGame());
      }
    },
    longTimeout,
  );

  // @covers 026:SC-004
  it("is deterministic: the same script ends in the same hash", () => {
    const again = play();
    expect(again.session.stateHash()).toBe(run.session.stateHash());
  });
});
