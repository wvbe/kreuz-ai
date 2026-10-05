/**
 * Categories of API failure; renderers and scripts branch on these instead of parsing messages.
 * Values are the stable strings that appear in `CommandResult.error.kind` and in the `code` of
 * the `command.rejected` event.
 */
export enum ApiErrorKind {
  /**
   * The input is not a command object with a string `kind`.
   */
  InvalidCommand = "invalid-command",
  /**
   * No command of that kind is registered.
   */
  UnknownCommand = "unknown-command",
  /**
   * The payload of a command or the arguments of a query failed schema validation.
   */
  InvalidPayload = "invalid-payload",
  /**
   * The operation needs a running game: dispatch NewGame or LoadGame first.
   */
  NoGame = "no-game",
  /**
   * NewGame options failed validation (messages in `issues`).
   */
  InvalidOptions = "invalid-options",
  /**
   * NewGame had no seed and the session has no entropy source.
   */
  MissingEntropy = "missing-entropy",
  /**
   * The save text is not a valid save (problems in `issues`).
   */
  InvalidSaveFormat = "invalid-save-format",
  /**
   * The save was written by a newer build.
   */
  UnsupportedSaveVersion = "unsupported-save-version",
  /**
   * A system init hook failed; the previous game was kept.
   */
  InitFailed = "init-failed",
  /**
   * A value outside its allowed range reached the engine (e.g. a speed or interval).
   */
  InvalidArgument = "invalid-argument",
  /**
   * The thing a query or command names does not exist.
   */
  NotFound = "not-found",
  /**
   * No query of that name is registered.
   */
  UnknownQuery = "unknown-query",
  /**
   * A handler threw; the message says why.
   */
  CommandFailed = "command-failed",
  /**
   * The predicate given to `runUntil` threw.
   */
  PredicateFailed = "predicate-failed",
  /**
   * A command log could not be replayed (divergence, rejected command or hash mismatch).
   */
  ReplayFailed = "replay-failed",
  /**
   * Something that is not an `Error` was thrown.
   */
  Internal = "internal",
}

/**
 * Typed API failure. Handlers and queries throw it to reject with a precise kind; the session
 * turns every thrown value into a structured result and never lets it escape `dispatch`.
 */
export class ApiError extends Error {
  /**
   * Creates the error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description.
   * @param issues - Individual problems (`path: message` lines), when there are several.
   */
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}
