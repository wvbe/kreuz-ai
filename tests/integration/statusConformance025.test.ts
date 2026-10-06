import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createScenarioSession } from "../../src/game/api/scenario/createScenarioSession";
import { runScenario } from "../../src/game/api/scenario/runScenario";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import { loadContent } from "../../src/game/content/ContentLoader";
import { GameEngine } from "../../src/game/engine/GameEngine";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { MapSize } from "../../src/game/map/mapSize";
import { runStatusPass } from "../../src/game/status/statusEvaluation";
import { getStatusService } from "../../src/game/status/statusServiceRegistry";
import { FlowDirection, FlowSource } from "../../src/game/status/statusTypes";
import { toDay } from "../../src/game/time/GameTime";
import { createSettlement, medianMs } from "../../scripts/lib/perfCases";

// Spec 025 success criteria that the unit tests do not reach: determinism over 2,000 ticks (SC-002),
// the cost of the status pass (SC-003, budget times 10 like the other wall-clock checks, D-114) and
// the ledger against an independent count of the events (SC-004).

const longTimeout = 240_000;

describe("spec 025 success criteria", () => {
  // @covers 025:SC-002
  it(
    "two runs from the same seed produce byte-identical statuses and ledger after 2,000 ticks",
    () => {
      const run = (): { statuses: string; ledger: string } => {
        const engine = new GameEngine(loadContent(), { entropy: () => 1 });
        engine.newGame({ seed: 42, mapSize: MapSize.Small });
        engine.runTicks(2000);
        return {
          statuses: JSON.stringify(getStatusService(engine).tracker.records()),
          ledger: JSON.stringify(getStatusService(engine).ledger.dayList()),
        };
      };
      const left = run();
      const right = run();
      expect(left.statuses).toBe(right.statuses);
      expect(left.ledger).toBe(right.ledger);
    },
    longTimeout,
  );

  // @covers 025:SC-003
  it(
    "evaluates the status of a 200-citizen settlement in a few milliseconds (budget 2 ms x 10)",
    () => {
      const session = createSettlement(200);
      session.step(10);
      const milliseconds = medianMs(5, () => {
        runStatusPass(session.engine, session.engine.time.tickCount);
      });
      expect(milliseconds).toBeLessThan(2 * 10);
    },
    longTimeout,
  );

  // @covers 025:SC-004
  it(
    "keeps a ledger that equals an independent count of the events on every day it holds",
    () => {
      const parsed = parseScenario(
        readFileSync(join(__dirname, "..", "..", "scenarios", "checkpoint-c.json"), "utf8"),
      );
      if (!parsed.ok) {
        throw new Error(parsed.issues.join("; "));
      }
      type Seen = { tick: number; name: string; payload: JsonValue };
      const seen: Seen[] = [];
      let engine: GameEngine | null = null;
      runScenario(parsed.scenario, {
        createSession: () => {
          const session = createScenarioSession();
          // the scenario's last step replays into a second session: count the first one only
          if (engine === null) {
            engine = session.engine;
            session.engine.bus.subscribe("**", (payload, event) => {
              seen.push({ tick: session.engine.time.tickCount, name: event.name, payload });
            });
          }
          return session;
        },
      });
      if (engine === null) {
        throw new Error("the scenario created no session");
      }
      const independent = new Map<string, number>();
      const add = (
        day: number,
        id: unknown,
        direction: FlowDirection,
        source: FlowSource,
        n: unknown,
      ) => {
        const key = `${day}|${String(id)}|${direction}|${source}`;
        independent.set(key, (independent.get(key) ?? 0) + Number(n));
      };
      const items = (
        payload: JsonValue,
        field: string,
      ): { materialId: string; quantity: number }[] => {
        const value =
          typeof payload === "object" && payload !== null && !Array.isArray(payload)
            ? payload[field]
            : undefined;
        return Array.isArray(value)
          ? (value as unknown as { materialId: string; quantity: number }[])
          : [];
      };
      for (const event of seen) {
        // events are processed in the drain of the tick after they were queued (slot 20)
        const day = toDay(event.tick);
        if (event.name === "production.crafting.completed") {
          for (const item of items(event.payload, "inputs")) {
            add(day, item.materialId, FlowDirection.Consumed, FlowSource.Recipe, item.quantity);
          }
          for (const item of items(event.payload, "outputs")) {
            add(day, item.materialId, FlowDirection.Produced, FlowSource.Recipe, item.quantity);
          }
        }
        if (
          event.name === "need.item.consumed" &&
          typeof event.payload === "object" &&
          event.payload !== null &&
          !Array.isArray(event.payload)
        ) {
          add(
            day,
            event.payload["materialId"],
            FlowDirection.Consumed,
            FlowSource.NeedConsumption,
            event.payload["quantity"],
          );
        }
      }
      const ledger = getStatusService(engine).ledger.dayList();
      expect(ledger.length).toBeGreaterThan(5);
      for (const day of ledger) {
        const counted = new Map<string, number>();
        for (const entry of day.entries) {
          if (entry.source === FlowSource.Recipe || entry.source === FlowSource.NeedConsumption) {
            const key = `${day.day}|${entry.materialId}|${entry.direction}|${entry.source}`;
            counted.set(key, (counted.get(key) ?? 0) + entry.quantity);
          }
        }
        const expected = new Map([...independent].filter(([key]) => key.startsWith(`${day.day}|`)));
        expect(Object.fromEntries(counted)).toEqual(Object.fromEntries(expected));
      }
    },
    longTimeout,
  );
});
