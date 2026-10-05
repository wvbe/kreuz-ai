import type { ScenarioResult } from "./runScenario";

/**
 * Renders a scenario result as the readable text the CLI prints: one `PASS` line, or a `FAIL`
 * block naming the step index, the message and the expected/actual values.
 *
 * @param result - A result from `runScenario`.
 * @returns The text, without a trailing newline.
 */
export function formatScenarioResult(result: ScenarioResult): string {
  if (result.ok) {
    return `PASS ${result.name}: ${result.stepsRun} steps, tick ${result.tick}, hash ${result.finalHash}`;
  }
  const { failure } = result;
  const lines = [
    `FAIL ${result.name}: step ${failure.stepIndex === -1 ? "new-game" : `#${failure.stepIndex}`}: ${failure.message}`,
  ];
  if (failure.expected !== undefined) {
    lines.push(`  expected: ${JSON.stringify(failure.expected)}`);
  }
  if (failure.actual !== undefined) {
    lines.push(`  actual:   ${JSON.stringify(failure.actual)}`);
  }
  return lines.join("\n");
}
