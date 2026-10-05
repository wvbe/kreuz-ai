import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runScenario } from "./runScenario";
import type { ScenarioResult } from "./runScenario";
import type { Scenario } from "./Scenario";
import { defineScenarioStep } from "./scenarioStep";
import type { ScenarioStepObject } from "./scenarioStep";

function scenario(steps: ScenarioStepObject[], seed = 7): Scenario {
  return { name: "test", seed, steps };
}

function failureOf(result: ScenarioResult): { stepIndex: number; message: string } {
  if (result.ok) {
    throw new Error("expected a failing scenario");
  }
  return result.failure;
}

describe("runScenario", () => {
  it("runs the built-in step types and reports tick and hash", () => {
    const result = runScenario(
      scenario([
        { step: 10 },
        { assert: { query: "time", path: "tick", op: "eq", value: 10 } },
        { assert: { query: "state", path: "seed", op: "eq", value: 7 } },
        { assert: { query: "entities", path: "total", op: "gte", value: 1 } },
        { assert: { query: "state", path: "difficulty", op: "exists" } },
        { assertHash: { label: "a" } },
        { command: { kind: "pause" } },
        { command: { kind: "resume" }, atTick: 10 },
        { command: { kind: "set-speed", speed: 2000 }, atTick: 12 },
        { assert: { query: "time", path: "speed", op: "eq", value: 2000 } },
        { saveLoad: true },
        { replay: true },
      ]),
    );
    expect(result).toMatchObject({ ok: true, stepsRun: 12, tick: 12 });
    expect(result.ok && result.finalHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic and seed-sensitive", () => {
    const run = (seed: number): string => {
      const result = runScenario(scenario([{ step: 50 }], seed));
      return result.ok ? result.finalHash : "failed";
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it("fails on the first wrong assertion with index, expected and actual", () => {
    const result = runScenario(
      scenario([{ step: 3 }, { assert: { query: "time", path: "tick", op: "eq", value: 4 } }]),
    );
    expect(result).toMatchObject({
      ok: false,
      stepsRun: 1,
      failure: { stepIndex: 1, expected: 4, actual: 3 },
    });
    expect(failureOf(result).message).toContain("time.tick eq 4");
  });

  it("fails for a missing path, a failing query and a hash mismatch", () => {
    expect(
      failureOf(runScenario(scenario([{ assert: { query: "time", path: "nope", op: "exists" } }])))
        .message,
    ).toContain("path not found");
    expect(
      failureOf(runScenario(scenario([{ assert: { query: "nothing", path: "", op: "exists" } }])))
        .message,
    ).toContain("unknown-query");
    expect(
      failureOf(runScenario(scenario([{ assertHash: { equals: "0000000000000000" } }]))).message,
    ).toContain("literal");
    expect(
      failureOf(runScenario(scenario([{ assertHash: { matches: "ghost" } }]))).message,
    ).toContain("ghost");
    expect(
      failureOf(
        runScenario(
          scenario([{ assertHash: { label: "a" } }, { step: 1 }, { assertHash: { matches: "a" } }]),
        ),
      ),
    ).toMatchObject({ stepIndex: 2 });
  });

  it("handles command failures and expectError", () => {
    expect(
      failureOf(runScenario(scenario([{ command: { kind: "set-speed", speed: 3 } }]))).message,
    ).toContain("invalid-payload");
    expect(
      runScenario(
        scenario([{ command: { kind: "set-speed", speed: 3 }, expectError: "invalid-payload" }]),
      ).ok,
    ).toBe(true);
    expect(
      failureOf(
        runScenario(scenario([{ command: { kind: "pause" }, expectError: "invalid-payload" }])),
      ).message,
    ).toContain("should have failed");
    expect(
      failureOf(
        runScenario(
          scenario([{ command: { kind: "set-speed", speed: 3 }, expectError: "no-game" }]),
        ),
      ).message,
    ).toContain("wrong error");
  });

  it("checks atTick against the clock", () => {
    expect(
      failureOf(runScenario(scenario([{ step: 5 }, { command: { kind: "pause" }, atTick: 2 }])))
        .message,
    ).toContain("already past");
    expect(
      failureOf(
        runScenario(
          scenario([{ command: { kind: "pause" } }, { command: { kind: "pause" }, atTick: 4 }]),
        ),
      ).message,
    ).toContain("paused");
  });

  it("rejects malformed steps before running anything", () => {
    const unknown = runScenario(scenario([{ step: 1 }, { dance: true }]));
    expect(failureOf(unknown)).toMatchObject({ stepIndex: 1 });
    expect(failureOf(unknown).message).toContain("unknown step");
    expect(failureOf(runScenario(scenario([{ step: 1, assertHash: {} }]))).message).toContain(
      "ambiguous",
    );
    expect(failureOf(runScenario(scenario([{ step: 0 }]))).message).toContain("invalid step");
    expect(
      failureOf(runScenario(scenario([{ assert: { query: "time", path: "tick", op: "eq" } }])))
        .message,
    ).toContain("value");
  });

  it("reports a failing new-game", () => {
    const result = runScenario({
      name: "bad",
      seed: 1,
      options: { difficulty: "nightmare" },
      steps: [],
    });
    expect(failureOf(result)).toMatchObject({ stepIndex: -1 });
  });

  it("accepts extra step types", () => {
    const hello = defineScenarioStep({
      key: "hello",
      schema: z.object({ hello: z.string() }).strict(),
      run: (step) => (step.hello === "world" ? null : { message: "wrong greeting" }),
    });
    expect(runScenario(scenario([{ hello: "world" }]), { stepTypes: [hello] }).ok).toBe(true);
    expect(
      failureOf(runScenario(scenario([{ hello: "moon" }]), { stepTypes: [hello] })).message,
    ).toBe("wrong greeting");
  });
});
