import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createScenarioSession } from "../../src/game/api/scenario/createScenarioSession";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import { planNeed } from "../../src/game/ai/decision/planNeed";
import { getNeedValue } from "../../src/game/ai/needs/needAccess";
import type { JsonValue } from "../../src/game/engine/EventBus";

// Invariant of DECISIONS D-180 (spec 013, harsh-survival finding of D-111): while edible food that a
// hungry settler can reach and that nobody reserved lies in a stockpile, the settler must not stay
// at hunger zero (unless it has also collapsed from exhaustion), and nobody may die of starvation.
// The food chain is the player-command opening of scenarios/harsh-survival.json, played for five
// days (1,440 ticks, ending after the first starvation window of Harsh), on Harsh and on Steady.

const fiveDays = 1440;
const patientTicks = 120;
const longTimeout = 280_000;

type Step = { [key: string]: JsonValue };

function openingSteps(): Step[] {
  const text = readFileSync(
    join(__dirname, "..", "..", "scenarios", "harsh-survival.json"),
    "utf8",
  );
  const parsed = parseScenario(text);
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  return parsed.scenario.steps.filter((step) => "command" in step || "step" in step);
}

type Report = { violations: string[]; starved: number[]; ticks: number };

function play(difficulty: string): Report {
  const session = createScenarioSession();
  session.newGame({ seed: 42, difficulty, mapSize: 0 });
  const engine = session.engine;
  const hunger = engine.content.needs.require("hunger");
  const starved: number[] = [];
  engine.bus.subscribe("entity.died", (payload) => {
    const data = payload as { entityId: number; cause: string };
    if (data.cause === "Starvation") {
      starved.push(data.entityId);
    }
  });
  const streaks = new Map<number, number>();
  const violations: string[] = [];
  for (const step of openingSteps()) {
    if ("command" in step) {
      session.dispatch(step["command"] as { kind: string });
      continue;
    }
    for (let tick = 0; tick < (step["step"] as number); tick += 1) {
      if (engine.time.tickCount >= fiveDays) {
        return { violations, starved, ticks: engine.time.tickCount };
      }
      session.step(1);
      for (const entity of engine.store.entities()) {
        if (!engine.content.humanoids.has(entity.prototype)) {
          continue;
        }
        const starving = getNeedValue(entity, "hunger") === 0 && getNeedValue(entity, "rest") !== 0;
        const fed = starving && planNeed(engine, entity, hunger) !== null;
        const streak = fed ? (streaks.get(entity.id) ?? 0) + 1 : 0;
        streaks.set(entity.id, streak);
        if (streak === patientTicks) {
          violations.push(
            `tick ${engine.time.tickCount}: settler ${entity.id} at hunger 0 for ${patientTicks} ticks with food it can reach`,
          );
        }
      }
    }
  }
  return { violations, starved, ticks: engine.time.tickCount };
}

describe("no settler starves while reachable unreserved food lies in a stockpile (five days)", () => {
  it(
    "Harsh, seed 42 Small, the harsh-survival opening",
    () => {
      const report = play("harsh");
      expect(report.ticks).toBe(fiveDays);
      expect(report.violations).toEqual([]);
      expect(report.starved).toEqual([]);
    },
    longTimeout,
  );

  it(
    "Steady, seed 42 Small, the same opening",
    () => {
      const report = play("steady");
      expect(report.ticks).toBe(fiveDays);
      expect(report.violations).toEqual([]);
      expect(report.starved).toEqual([]);
    },
    longTimeout,
  );
});
