import type { JsonValue } from "../engine/EventBus";
import type { ApiErrorKind } from "./ApiError";

/**
 * A structured failure as it appears in results (JSON).
 */
export type ApiErrorData = {
  kind: ApiErrorKind;
  message: string;
  /**
   * Individual problems (`path: message`), present when there are several.
   */
  issues?: readonly string[];
};

/**
 * One delivered engine event as seen by the facade: a deep copy, safe to keep and mutate.
 */
export type EventRecord = {
  /**
   * Position in the session's event stream, ascending and gap free per session.
   */
  seq: number;
  /**
   * Tick count when the event was delivered.
   */
  tick: number;
  name: string;
  payload: JsonValue;
};

/**
 * Events that happened during one call, bounded by the session's recent-event buffer.
 */
export type CallEvents = {
  events: readonly EventRecord[];
  /**
   * How many events of this call do not appear in `events` because the buffer overflowed.
   */
  droppedEvents: number;
};

/**
 * Success of `dispatch`.
 */
export type CommandSuccess = CallEvents & {
  ok: true;
  /**
   * Id of the accepted command; also the id in `command.applied` / `command.rejected`.
   */
  commandId: number;
  /**
   * True when the command waits in the queue for slot 1 of the next tick; its effects are not
   * visible yet and `data` is null.
   */
  queued: boolean;
  /**
   * What the handler returned (immediate commands), otherwise null.
   */
  data: JsonValue;
};

/**
 * Failure of `dispatch`, `step`, `runUntil` or a query; nothing was changed.
 */
export type CommandFailure = {
  ok: false;
  error: ApiErrorData;
};

/**
 * Result of `GameSession.dispatch`.
 */
export type CommandResult = CommandSuccess | CommandFailure;

/**
 * Result of a query: the view as plain JSON, or a failure.
 */
export type QueryResult = { ok: true; data: JsonValue } | CommandFailure;

/**
 * Why `runUntil` returned.
 */
export enum RunStopReason {
  /**
   * The predicate became true.
   */
  Satisfied = "satisfied",
  /**
   * `maxTicks` ticks ran without the predicate becoming true.
   */
  MaxTicks = "max-ticks",
  /**
   * The clock is paused, so no tick can run.
   */
  Paused = "paused",
}

/**
 * Success of `GameSession.runUntil`.
 */
export type RunUntilSuccess = CallEvents & {
  ok: true;
  satisfied: boolean;
  stopReason: RunStopReason;
  ticksRun: number;
  /**
   * Tick count after the run.
   */
  tick: number;
};

/**
 * Result of `GameSession.runUntil`.
 */
export type RunUntilResult = RunUntilSuccess | CommandFailure;
