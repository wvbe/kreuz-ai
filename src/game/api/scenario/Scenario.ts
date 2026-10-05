import { z } from "zod";
import { jsonValueSchema } from "../../ecs/jsonData";
import type { JsonValue } from "../../engine/EventBus";
import { formatZodIssues } from "../toApiError";
import type { ScenarioStepObject } from "./scenarioStep";

/**
 * Zod schema of a scenario file. Step objects are validated by their step types at run time
 * (see `runScenario`), so later phases can add step types without touching this schema.
 */
export const scenarioSchema = z
  .object({
    name: z.string().min(1),
    seed: z.number().int().min(0).max(4_294_967_295),
    options: z.record(z.string(), jsonValueSchema).optional(),
    steps: z.array(z.record(z.string(), jsonValueSchema)),
  })
  .strict();

/**
 * A scripted game: new game with `seed` (and `options`), then the steps in order.
 */
export type Scenario = {
  name: string;
  seed: number;
  options?: { [name: string]: JsonValue };
  steps: ScenarioStepObject[];
};

/**
 * Outcome of {@link parseScenario}.
 */
export type ParsedScenario = { ok: true; scenario: Scenario } | { ok: false; issues: string[] };

/**
 * Parses and validates scenario file text.
 *
 * @param text - The JSON text of a scenario file.
 * @returns The scenario, or readable issues (invalid JSON or schema violations).
 */
export function parseScenario(text: string): ParsedScenario {
  let raw: JsonValue;
  try {
    raw = JSON.parse(text) as JsonValue; // validated by scenarioSchema right below
  } catch (thrown) {
    return {
      ok: false,
      issues: [`not valid JSON: ${thrown instanceof Error ? thrown.message : String(thrown)}`],
    };
  }
  const parsed = scenarioSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, scenario: parsed.data }
    : { ok: false, issues: formatZodIssues(parsed.error.issues) };
}
