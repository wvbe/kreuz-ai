import type { z } from "zod";
import type { CommandMode, CommandRegistration } from "../engine/engineSystemTypes";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";

/**
 * What a system supplies to add one command kind.
 */
export type CommandDefinition<Payload> = {
  /**
   * Validates the payload, i.e. the dispatched JSON object without `kind`. Use `.strict()` so
   * typos are rejected. The schema must be idempotent (no transforms): the handler parses the
   * already validated payload once more to get its typed value.
   */
  schema: z.ZodType<Payload>;
  /**
   * Applies the command. Throw to reject: for queued commands that emits `command.rejected`
   * (state changes made before the throw are not rolled back, so validate first), for immediate
   * ones the dispatch returns a failure.
   */
  handler: (payload: Payload, engine: GameEngine) => JsonValue;
  /**
   * Default {@link CommandMode.Queued}: applied at pipeline slot 1 of the next tick.
   */
  mode?: CommandMode;
  /**
   * Set to false for commands usable without a running game. Default true.
   */
  requiresGame?: boolean;
};

/**
 * Builds the registration of one command kind with a typed payload, ready for
 * `registerSystem({ commandHandlers: { "my-kind": defineCommand({...}) } })`.
 *
 * @param definition - Schema, handler and mode.
 * @returns The registration the engine stores.
 */
export function defineCommand<Payload>(
  definition: CommandDefinition<Payload>,
): CommandRegistration {
  return {
    schema: definition.schema,
    mode: definition.mode,
    requiresGame: definition.requiresGame,
    handler: (payload, engine) => definition.handler(definition.schema.parse(payload), engine),
  };
}
