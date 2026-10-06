import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/api/GameSession";
import { formatScenarioResult } from "../../src/game/api/scenario/formatScenarioResult";
import { runScenario } from "../../src/game/api/scenario/runScenario";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import type { Scenario } from "../../src/game/api/scenario/Scenario";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { buildIdleBlockedView } from "../../src/game/status/idleBlocked";
import { BlockedReasonKind, StatusSubjectKind } from "../../src/game/status/statusTypes";

// Checkpoint C (plan phase 3): a Hamlet played with player commands only (zones, construction,
// production orders) feeds itself: wheat is grown, ground and baked, bread is eaten and nobody
// starves. The script is scenarios/checkpoint-c.json; docs/PLAYING.md describes the same opening.

const scenarioPath = join(__dirname, "..", "..", "scenarios", "checkpoint-c.json");
const dayTicks = 288;

function loadScenario(): Scenario {
  const parsed = parseScenario(readFileSync(scenarioPath, "utf8"));
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  return parsed.scenario;
}

function citizenCount(session: GameSession): number {
  return session.engine.store
    .entities()
    .filter((entity) => entity.components["Needs"] !== undefined).length;
}

function unexplained(session: GameSession): string[] {
  return buildIdleBlockedView(session.engine, { includeUnsettled: true })
    .filter((row) => row.reasons.some((reason) => reason.kind === BlockedReasonKind.Unexplained))
    .map((row) => `${row.subject.kind}#${row.subject.id}`);
}

describe("Checkpoint C: the playable loop (seed 42, Small, player commands only)", () => {
  it("uses real commands only: no debug spawn anywhere in the script", () => {
    expect(readFileSync(scenarioPath, "utf8")).not.toContain("debugSpawn");
    const plain = runScenario(loadScenario(), { createSession: () => new GameSession() });
    expect(formatScenarioResult(plain)).toMatch(/^PASS checkpoint-c/);
  });

  it("is deterministic: two runs end in the same state hash", () => {
    const first = runScenario(loadScenario());
    const second = runScenario(loadScenario());
    expect(first.ok && second.ok).toBe(true);
    expect(second).toEqual(first);
  });

  it("feeds six settlers for 14 days: bread eaten every day, nobody dies, nothing unexplained", () => {
    const eaten: { tick: number; materialId: string }[] = [];
    const created: GameSession[] = [];
    const result = runScenario(loadScenario(), {
      createSession: () => {
        const session = new GameSession();
        session.engine.bus.subscribe("need.item.consumed", (payload: JsonValue) => {
          const record = payload as { materialId: string };
          eaten.push({ tick: session.engine.time.tickCount, materialId: record.materialId });
        });
        created.push(session);
        return session;
      },
    });
    expect(result.ok).toBe(true);
    const session = created[0] as GameSession;
    expect(session.engine.time.tickCount).toBe(10 * dayTicks);
    expect(eaten.filter((entry) => entry.materialId === "bread").length).toBeGreaterThan(40);
    expect(citizenCount(session)).toBe(6);
    expect(unexplained(session)).toEqual([]);
    for (let day = 11; day <= 14; day += 1) {
      session.step(dayTicks);
      expect(citizenCount(session)).toBe(6);
      expect(unexplained(session)).toEqual([]);
    }
    const lastDay = eaten.filter(
      (entry) => entry.materialId === "bread" && entry.tick > 13 * dayTicks,
    );
    expect(lastDay.length).toBeGreaterThan(0);
  });

  it("explains every idle citizen: Idle rows carry a primary reason from the 025 list", () => {
    const created: GameSession[] = [];
    runScenario(loadScenario(), {
      createSession: () => {
        const session = new GameSession();
        created.push(session);
        return session;
      },
    });
    const session = created[0] as GameSession;
    const rows = buildIdleBlockedView(session.engine, { includeUnsettled: true }).filter(
      (row) => row.subject.kind === StatusSubjectKind.Citizen,
    );
    for (const row of rows) {
      expect(row.reasons.length).toBeGreaterThan(0);
      expect(row.reasons[0]?.kind).not.toBe(BlockedReasonKind.Unexplained);
    }
    const why = session.query.run("explain", { id: 3, kind: "Citizen" });
    expect(why.ok).toBe(true);
  });

  it("without any command the same settlers starve (the loop is the player's work)", () => {
    const session = new GameSession();
    session.newGame({ seed: 42, difficulty: "steady", mapSize: 0 });
    session.step(10 * dayTicks);
    expect(citizenCount(session)).toBeLessThan(6);
  });
});
