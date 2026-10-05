import type { z } from "zod";
import { jsonValueSchema } from "../ecs/jsonData";
import type { QueryRegistration } from "../engine/engineSystemTypes";
import type { GameEngine } from "../engine/GameEngine";

/**
 * Readonly JSON: what a view function may return. `defineQuery` copies it into a plain
 * `JsonValue` and verifies it (safe-integer numbers, no `undefined`).
 */
export type ReadonlyJson =
  | string
  | number
  | boolean
  | null
  | readonly ReadonlyJson[]
  | { readonly [key: string]: ReadonlyJson };

/**
 * What a system supplies to add one named query (view).
 */
export type QueryDefinition<Args> = {
  /**
   * Validates the arguments, a JSON object (`{}` when the caller gave none). Use `.strict()`.
   * The schema must be idempotent (no transforms).
   */
  schema: z.ZodType<Args>;
  /**
   * Computes the view from the engine without changing anything. The result is copied and
   * checked to be JSON, so no engine object can leak through it.
   */
  run: (args: Args, engine: GameEngine) => ReadonlyJson;
};

/**
 * Builds the registration of one query with typed arguments, ready for
 * `registerSystem({ queries: { "jobs.board": defineQuery({...}) } })`.
 *
 * @param definition - Schema and view function.
 * @returns The registration the engine stores.
 */
export function defineQuery<Args>(definition: QueryDefinition<Args>): QueryRegistration {
  return {
    schema: definition.schema,
    run: (args, engine) =>
      jsonValueSchema.parse(definition.run(definition.schema.parse(args), engine)),
  };
}
