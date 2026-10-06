import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render } from "@testing-library/react";
import { GameSession } from "../../../game/api/GameSession";
import { runScenario } from "../../../game/api/scenario/runScenario";
import { parseScenario } from "../../../game/api/scenario/Scenario";
import type { Scenario } from "../../../game/api/scenario/Scenario";
import { EngineHost } from "../engine/EngineHost";
import { EngineProvider } from "../engine/EngineProvider";
import { ToastHost } from "../ui/ToastHost";
import { createFakeScheduler } from "./fakeScheduler";
import { runScenarioThroughHost } from "./runScenarioThroughHost";
import type { HostScenarioResult } from "./runScenarioThroughHost";

/**
 * A scenario that was played through an `EngineHost` and through the in-process runner.
 */
export type PlayedScenario = {
  host: EngineHost;
  /**
   * State hash after the host run.
   */
  hash: string;
  /**
   * State hash after the in-process runner's run of the same steps.
   */
  cliHash: string;
  tick: number;
  /**
   * Every toast text that was shown at some time during the run (toasts expire with game time).
   */
  toastTexts: Set<string>;
};

/**
 * Reads a scenario file of the repo's `scenarios/` folder and keeps only the `command` and `step`
 * steps: the state hash includes the command id counter, so both paths must play the same steps.
 *
 * @param name - The file name without `.json`.
 * @returns The scenario.
 */
export function loadScenarioForHost(name: string): Scenario {
  const path = join(__dirname, "..", "..", "..", "..", "scenarios", `${name}.json`);
  const parsed = parseScenario(readFileSync(path, "utf8"));
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  return {
    ...parsed.scenario,
    steps: parsed.scenario.steps.filter((step) => "command" in step || "step" in step),
  };
}

const played = new Map<string, PlayedScenario>();

/**
 * Plays a scenario file through a fresh host with the toast host mounted (so engine events
 * become toasts) and through the in-process runner. The result is memoised per name, so one test
 * file runs each scenario once. jsdom environment only (it renders React).
 *
 * @param name - The scenario file name without `.json`.
 * @returns The host with the final state and both state hashes.
 * @throws {Error} When either run fails.
 */
export function playScenarioOnHost(name: string): PlayedScenario {
  const known = played.get(name);
  if (known !== undefined) {
    return known;
  }
  const scenario = loadScenarioForHost(name);
  const cli = runScenario(scenario, { createSession: () => new GameSession() });
  if (!cli.ok) {
    throw new Error(`${name}: the in-process runner failed`);
  }
  const host = new EngineHost({ scheduler: createFakeScheduler().scheduler });
  const view = render(
    <EngineProvider host={host}>
      <ToastHost />
    </EngineProvider>,
  );
  const toastTexts = new Set<string>();
  host.toasts.subscribe(() => {
    for (const toast of host.toasts.getSnapshot().toasts) {
      toastTexts.add(toast.text);
    }
  });
  const outcome: HostScenarioResult[] = [];
  act(() => {
    outcome.push(runScenarioThroughHost(host, scenario));
  });
  view.unmount();
  const result = outcome[0];
  if (result === undefined || !result.ok) {
    throw new Error(`${name}: the host run failed`);
  }
  const entry: PlayedScenario = {
    host,
    hash: result.hash,
    cliHash: cli.finalHash,
    tick: result.tick,
    toastTexts,
  };
  played.set(name, entry);
  return entry;
}
