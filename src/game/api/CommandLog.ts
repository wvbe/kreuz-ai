import { z } from "zod";
import { jsonValueSchema } from "../ecs/jsonData";
import type { JsonValue } from "../engine/EventBus";
import type { ApiErrorData } from "./CommandResult";

/**
 * A command as stored in the log: the dispatched JSON object. NewGame is stored with the seed
 * that was actually used, so replaying needs no entropy source.
 */
export type LoggedCommand = { [key: string]: JsonValue; kind: string };

/**
 * One accepted command (DECISIONS D-23).
 */
export type CommandLogEntry = {
  /**
   * Id the command got (ids restart at 1 with every NewGame).
   */
  commandId: number;
  /**
   * Tick count at dispatch. Replay dispatches the command when the replaying session is at this
   * tick (NewGame and LoadGame excepted, they replace the clock).
   */
  tick: number;
  /**
   * Tick count at which the command took effect: equal to `tick` for immediate commands, the
   * tick of the slot-1 pass for queued ones, null while a queued command still waits.
   */
  appliedTick: number | null;
  command: LoggedCommand;
};

/**
 * A command log: the accepted commands in dispatch order.
 */
export type CommandLog = readonly CommandLogEntry[];

/**
 * Zod schema of a log file (a JSON array of entries); use it to validate a log read from disk
 * before {@link GameSession.replay}.
 */
export const commandLogSchema = z.array(
  z
    .object({
      commandId: z.number().int().min(1),
      tick: z.number().int().min(0),
      appliedTick: z.number().int().min(0).nullable(),
      command: z.record(z.string(), jsonValueSchema).and(z.object({ kind: z.string().min(1) })),
    })
    .strict(),
);

/**
 * Options of `GameSession.replay`.
 */
export type ReplayOptions = {
  /**
   * When given, the replay fails unless the final state hash equals it.
   */
  expectedHash?: string;
};

/**
 * Result of `GameSession.replay`.
 */
export type ReplayResult =
  | { ok: true; applied: number; tick: number; stateHash: string }
  | { ok: false; applied: number; index: number; error: ApiErrorData };
