import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "../../../game/api/GameSession";
import { runScenario } from "../../../game/api/scenario/runScenario";
import { parseScenario } from "../../../game/api/scenario/Scenario";
import type { Scenario } from "../../../game/api/scenario/Scenario";
import { EngineHost } from "../engine/EngineHost";
import { createFakeScheduler } from "./fakeScheduler";
import { runScenarioThroughHost } from "./runScenarioThroughHost";

const path = join(__dirname, "..", "..", "..", "..", "scenarios", "checkpoint-c.json");

function load(): Scenario {
  const parsed = parseScenario(readFileSync(path, "utf8"));
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  return parsed.scenario;
}

describe("UI smoke scenario: checkpoint C through the EngineHost", () => {
  it("ends in the same state hash as the CLI scenario path", () => {
    const scenario = load();
    const cli = runScenario(scenario, { createSession: () => new GameSession() });
    expect(cli.ok).toBe(true);
    const host = new EngineHost();
    const viaHost = runScenarioThroughHost(host, scenario);
    expect(viaHost.ok).toBe(true);
    if (cli.ok && viaHost.ok) {
      expect(viaHost.hash).toBe(cli.finalHash);
      expect(viaHost.tick).toBe(cli.tick);
      expect(viaHost.stepsRun).toBeGreaterThan(10);
    }
  });

  it("replays the UI command log into a fresh session with the same hash", () => {
    const host = new EngineHost();
    const viaHost = runScenarioThroughHost(host, load());
    const fresh = new GameSession();
    const replay = fresh.replay(host.session.commandLog, {
      expectedHash: viaHost.ok ? viaHost.hash : "",
    });
    expect(replay.ok).toBe(true);
  });

  it("reaches the same hash when the clock, not step, advances time", () => {
    const scenario: Scenario = {
      name: "clock",
      seed: 42,
      options: { difficulty: "steady", mapSize: 0 },
      steps: [{ step: 30 }],
    };
    const cli = runScenario(scenario, { createSession: () => new GameSession() });
    const fake = createFakeScheduler();
    const host = new EngineHost({ scheduler: fake.scheduler });
    host.dispatch({ kind: "new-game", options: { seed: 42, difficulty: "steady", mapSize: 0 } });
    host.startClock();
    fake.fireMany(30);
    expect(cli.ok && host.session.stateHash() === cli.finalHash).toBe(true);
  });

  it("reports a failing step with its index", () => {
    const result = runScenarioThroughHost(new EngineHost(), {
      name: "bad",
      seed: 1,
      steps: [{ command: { kind: "nonsense" } }],
    });
    expect(result).toMatchObject({ ok: false, stepIndex: 0 });
    const bad = runScenarioThroughHost(new EngineHost(), {
      name: "bad-options",
      seed: 1,
      options: { difficulty: "super-hard" },
      steps: [],
    });
    expect(bad).toMatchObject({ ok: false, stepIndex: -1 });
  });
});
