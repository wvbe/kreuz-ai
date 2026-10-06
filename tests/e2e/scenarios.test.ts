import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatScenarioResult } from "../../src/game/api/scenario/formatScenarioResult";
import { runScenario } from "../../src/game/api/scenario/runScenario";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import type { Scenario } from "../../src/game/api/scenario/Scenario";

// Runs every file of scenarios/ in-process through the scenario runner (plan task 1.10).

const longScenarioTimeout = 300_000;
const scenarioDir = join(__dirname, "..", "..", "scenarios");
const files = readdirSync(scenarioDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

function load(path: string): Scenario {
  const parsed = parseScenario(readFileSync(path, "utf8"));
  if (!parsed.ok) {
    throw new Error(`${path}: ${parsed.issues.join("; ")}`);
  }
  return parsed.scenario;
}

describe("scenarios/", () => {
  it("contains the Phase 1 scenarios", () => {
    expect(files).toEqual(expect.arrayContaining(["determinism.json", "kernel-smoke.json"]));
  });

  describe.each(files)("%s", (file) => {
    const scenario = load(join(scenarioDir, file));

    // hamlet-to-village plays 33 game days; under coverage and a loaded machine a run takes
    // about 45 s, so these two tests get a longer limit than the 60 s default.
    it(
      "passes",
      () => {
        const result = runScenario(scenario);
        expect(formatScenarioResult(result)).toMatch(/^PASS /);
      },
      longScenarioTimeout,
    );

    it(
      "is deterministic: two runs end in the same tick and state hash",
      () => {
        const first = runScenario(scenario);
        const second = runScenario(scenario);
        expect(first.ok && second.ok).toBe(true);
        expect(second).toEqual(first);
      },
      longScenarioTimeout,
    );
  });

  it("the same scenario with another seed ends in another state", () => {
    const scenario = load(join(scenarioDir, "determinism.json"));
    const base = runScenario(scenario);
    const other = runScenario({ ...scenario, seed: scenario.seed + 1 });
    expect(base.ok && other.ok).toBe(true);
    expect(base.ok && other.ok && base.finalHash !== other.finalHash).toBe(true);
  });

  it("a failing fixture reports its step", () => {
    const result = runScenario(load(join(__dirname, "fixtures", "failing.json")));
    expect(formatScenarioResult(result)).toContain("FAIL deliberately-failing: step #1");
  });
});
