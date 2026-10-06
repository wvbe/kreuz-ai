import type { Scenario } from "../../../game/api/scenario/Scenario";
import type { EngineHost } from "../engine/EngineHost";
import type { GameCommand } from "../engine/gameCommands";

/**
 * Result of {@link runScenarioThroughHost}.
 */
export type HostScenarioResult =
  | { ok: true; tick: number; hash: string; stepsRun: number }
  | { ok: false; stepIndex: number; message: string };

/**
 * Plays the `command` and `step` steps of a scenario through an `EngineHost` instead of the
 * scenario runner: the new game with `{...options, seed}`, each command through
 * `host.dispatch` (the path every UI control uses) and each `step` through `host.step`. Other
 * steps (assert, assertHash, saveLoad, replay) are skipped, so the final hash can be compared
 * with the one the CLI path reports for the same scenario: that equality proves the UI reaches
 * exactly the engine behaviour the CLI does.
 *
 * @param host - A host without a game.
 * @param scenario - A parsed scenario.
 * @returns The final tick and state hash, or the first failing step.
 */
export function runScenarioThroughHost(host: EngineHost, scenario: Scenario): HostScenarioResult {
  const started = host.dispatch({
    kind: "new-game",
    options: { ...scenario.options, seed: scenario.seed },
  });
  if (!started.ok) {
    return { ok: false, stepIndex: -1, message: started.error.message };
  }
  let stepsRun = 0;
  for (const [stepIndex, step] of scenario.steps.entries()) {
    if (typeof step["step"] === "number") {
      const result = host.step(step["step"]);
      if (!result.ok) {
        return { ok: false, stepIndex, message: result.error.message };
      }
      stepsRun += 1;
    } else if (typeof step["command"] === "object" && step["command"] !== null) {
      const result = host.dispatch(step["command"] as GameCommand);
      if (!result.ok) {
        return { ok: false, stepIndex, message: result.error.message };
      }
      stepsRun += 1;
    }
  }
  return { ok: true, tick: host.session.tick, hash: host.session.stateHash(), stepsRun };
}
