import type { GameSession } from "../GameSession";
import { builtinScenarioSteps } from "./builtinScenarioSteps";
import { createScenarioSession } from "./createScenarioSession";
import type { Scenario } from "./Scenario";
import type { ScenarioStepObject, ScenarioStepType, StepFailure } from "./scenarioStep";

/**
 * A failed step: its index (`-1` is the initial new-game) plus the step's failure.
 */
export type ScenarioFailure = StepFailure & {
  stepIndex: number;
};

/**
 * Result of {@link runScenario}.
 */
export type ScenarioResult =
  | { ok: true; name: string; stepsRun: number; tick: number; finalHash: string }
  | { ok: false; name: string; stepsRun: number; failure: ScenarioFailure };

/**
 * Options of {@link runScenario}.
 */
export type RunScenarioOptions = {
  /**
   * Builds the session (default: `createScenarioSession()`, a `GameSession` over the bundled
   * content that also knows the debug command `DebugSpawn`). Later phases that
   * register systems in a constructor-time factory pass it here.
   */
  createSession?: () => GameSession;
  /**
   * Extra step types, added to the built-in ones.
   */
  stepTypes?: readonly ScenarioStepType[];
};

function findStepType(
  step: ScenarioStepObject,
  types: readonly ScenarioStepType[],
): ScenarioStepType | string {
  const matches = types.filter((type) => Object.hasOwn(step, type.key));
  if (matches.length === 1 && matches[0] !== undefined) {
    return matches[0];
  }
  return matches.length === 0
    ? `unknown step (keys: ${Object.keys(step).join(", ") || "none"}); known: ${types.map((type) => type.key).join(", ")}`
    : `ambiguous step: matches ${matches.map((type) => type.key).join(" and ")}`;
}

/**
 * Runs a scenario deterministically: validates every step first (nothing runs if one is
 * malformed), starts a game with `{...options, seed}`, executes the steps in order and stops at
 * the first failure.
 *
 * @param scenario - A parsed scenario.
 * @param options - Session factory and extra step types.
 * @returns The final tick and state hash, or the failing step index with expected/actual.
 */
export function runScenario(scenario: Scenario, options: RunScenarioOptions = {}): ScenarioResult {
  const types = [...builtinScenarioSteps, ...(options.stepTypes ?? [])];
  const resolved: { type: ScenarioStepType; step: ScenarioStepObject }[] = [];
  for (const [stepIndex, step] of scenario.steps.entries()) {
    const type = findStepType(step, types);
    const issues = typeof type === "string" ? [type] : type.validate(step);
    if (typeof type === "string" || issues.length > 0) {
      return {
        ok: false,
        name: scenario.name,
        stepsRun: 0,
        failure: { stepIndex, message: `invalid step: ${issues.join("; ")}` },
      };
    }
    resolved.push({ type, step });
  }
  const createSession = options.createSession ?? ((): GameSession => createScenarioSession());
  const session = createSession();
  const started = session.newGame({ ...scenario.options, seed: scenario.seed });
  if (!started.ok) {
    return {
      ok: false,
      name: scenario.name,
      stepsRun: 0,
      failure: {
        stepIndex: -1,
        message: `new-game failed: ${started.error.kind}: ${started.error.message}`,
      },
    };
  }
  const context = { session, createSession, hashes: new Map<string, string>() };
  for (const [stepIndex, entry] of resolved.entries()) {
    const failure = entry.type.execute(entry.step, context);
    if (failure !== null) {
      return {
        ok: false,
        name: scenario.name,
        stepsRun: stepIndex,
        failure: { stepIndex, ...failure },
      };
    }
  }
  return {
    ok: true,
    name: scenario.name,
    stepsRun: resolved.length,
    tick: session.tick,
    finalHash: session.stateHash(),
  };
}
