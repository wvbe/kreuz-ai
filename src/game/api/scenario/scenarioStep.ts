import type { z } from "zod";
import type { JsonValue } from "../../engine/EventBus";
import type { GameSession } from "../GameSession";
import { formatZodIssues } from "../toApiError";

/**
 * One step as written in a scenario file: a JSON object whose keys select the step type.
 */
export type ScenarioStepObject = { [key: string]: JsonValue };

/**
 * Why a step failed: a readable message plus, for comparisons, what was expected and found.
 */
export type StepFailure = {
  message: string;
  expected?: JsonValue;
  actual?: JsonValue;
};

/**
 * What a step type may use while it runs.
 */
export type StepContext = {
  /**
   * The session the scenario drives.
   */
  session: GameSession;
  /**
   * Builds a fresh session the same way the runner built the first one (used by `replay`).
   */
  createSession: () => GameSession;
  /**
   * State hashes recorded by `assertHash` steps, by label.
   */
  hashes: Map<string, string>;
};

/**
 * A registered kind of scenario step. Build it with {@link defineScenarioStep}.
 */
export type ScenarioStepType = {
  /**
   * The object key that selects this type (`step`, `command`, ...).
   */
  key: string;
  /**
   * Validates a raw step object against the type's schema.
   */
  validate: (raw: ScenarioStepObject) => string[];
  /**
   * Runs a validated step; null means success.
   */
  execute: (raw: ScenarioStepObject, context: StepContext) => StepFailure | null;
};

/**
 * Defines a scenario step type. The schema describes the WHOLE step object (key and modifiers) and
 * should be `.strict()`. Later phases add a type by defining it and passing it in
 * `runScenario(scenario, { stepTypes })`.
 *
 * @param definition - The selecting key, the Zod schema of the step object and the runner.
 * @returns The registered type.
 */
export function defineScenarioStep<Schema extends z.ZodType>(definition: {
  key: string;
  schema: Schema;
  run: (step: z.infer<Schema>, context: StepContext) => StepFailure | null;
}): ScenarioStepType {
  return {
    key: definition.key,
    validate: (raw) => {
      const parsed = definition.schema.safeParse(raw);
      return parsed.success ? [] : formatZodIssues(parsed.error.issues);
    },
    execute: (raw, context) => definition.run(definition.schema.parse(raw), context),
  };
}
