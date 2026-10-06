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
import { ticksPerDay } from "../../src/game/time/GameTime";

// Task 4.5 acceptance (spec 029, DECISIONS D-28 and D-58): the scripted path from Hamlet to
// Village with player commands only. Four hovels in dwelling zones, a throne room as the seat of
// government, settlers who arrive at most two a day and a promotion on the next day boundary.

type Seen = { tick: number; name: string; payload: JsonValue };

const scenarioPath = join(__dirname, "..", "..", "scenarios", "hamlet-to-village.json");

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

// One full run of the scenario with a recorder on the bus; afterwards the status of everything.
function play(): { result: string; events: Seen[]; unexplained: number; hash: string } {
  const events: Seen[] = [];
  let finished: GameSession | null = null;
  const result = runScenario(loadScenario(), {
    createSession: () => {
      const session = createScenarioSession();
      session.engine.bus.subscribe("**", (payload, event) => {
        events.push({ tick: session.engine.time.tickCount, name: event.name, payload });
      });
      finished = session;
      return session;
    },
  });
  const session = finished as GameSession | null;
  const view = session?.query.run("idle-blocked", { includeUnsettled: true });
  const rows = view?.ok === true && Array.isArray(view.data) ? view.data : [];
  return {
    result: formatScenarioResult(result),
    events,
    unexplained: rows.filter((row) => JSON.stringify(row).includes("Unexplained")).length,
    hash: session?.stateHash() ?? "",
  };
}

describe("hamlet-to-village (task 4.5, player commands only)", () => {
  const run = play();

  it("passes its own assertions", () => {
    expect(run.result).toMatch(/^PASS hamlet-to-village/);
  });

  it("uses only player commands: no debug hooks in the script", () => {
    const steps = loadScenario().steps;
    expect(steps.some((step) => "debugSpawn" in step)).toBe(false);
    const kinds = steps.flatMap((step) => {
      const command = step["command"];
      return typeof command === "object" && command !== null && !Array.isArray(command)
        ? [String(command["kind"])]
        : [];
    });
    expect(new Set(kinds)).toEqual(
      new Set([
        "DesignateZone",
        "PlaceFurniture",
        "PlaceWall",
        "PlaceDoor",
        "CreateProductionOrder",
        "TradeBuy",
      ]),
    );
  });

  it("promotes to Village on a day boundary, one day after the fourth dwelling", () => {
    const tier = run.events.filter((event) => event.name === "settlement.tier.reached");
    expect(tier).toHaveLength(1);
    expect(tier[0]?.payload).toMatchObject({ tier: "village", previousTier: "hamlet" });
    expect(tier[0]?.tick).toBeLessThanOrEqual(40 * ticksPerDay);
    expect((tier[0]?.tick ?? 1) % ticksPerDay).toBe(0);
    const arrivals = run.events.filter((event) => event.name === "housing.immigrant.arrived");
    expect(arrivals).toHaveLength(2);
    expect((arrivals[1]?.tick ?? 0) % ticksPerDay).toBe(72);
    expect(tier[0]?.tick).toBeGreaterThan(arrivals[1]?.tick ?? 0);
  });

  it("admits at most two settlers a day, named, on the evaluation tick (FR-015, D-17)", () => {
    const arrivals = run.events.filter((event) => event.name === "housing.immigrant.arrived");
    const perDay = new Map<number, number>();
    for (const arrival of arrivals) {
      const day = Math.floor(arrival.tick / ticksPerDay);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      expect(arrival.tick % ticksPerDay).toBe(72);
      expect(field(arrival.payload, "prototypeId")).toBe("peasant");
    }
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
    const named = run.events.filter((event) => event.name === "identity.named");
    expect(named.length).toBeGreaterThanOrEqual(8);
  });

  it("houses the six founders first, in id order, and the settlers after them", () => {
    const assigned = run.events.filter((event) => event.name === "housing.resident.assigned");
    expect(assigned).toHaveLength(8);
    const ids = assigned.map((event) => Number(field(event.payload, "entityId")));
    const founders = ids.slice(0, 6);
    expect(founders).toEqual([...founders].sort((left, right) => left - right));
    // The two settlers come after every founder has a home and have the highest ids.
    expect(Math.min(...ids.slice(6))).toBeGreaterThan(Math.max(...founders));
  });

  it("creates the Dwelling state when a dwelling zone becomes active, four times", () => {
    const met = run.events.filter(
      (event) =>
        event.name === "zone.requirements.met" && field(event.payload, "zoneTypeId") === "dwelling",
    );
    expect(met).toHaveLength(4);
  });

  it("starves nobody, is never blocked from admitting settlers and leaves nothing unexplained", () => {
    expect(run.events.filter((event) => event.name === "entity.died")).toEqual([]);
    expect(run.events.filter((event) => event.name === "housing.immigration.blocked")).toEqual([]);
    expect(run.unexplained).toBe(0);
  });
}, 180_000);
