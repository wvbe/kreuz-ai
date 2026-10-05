/**
 * Categories of engine host failure; callers branch on these instead of parsing messages.
 */
export enum GameEngineErrorKind {
  /**
   * An operation needs a running game and neither `newGame` nor `loadGame` has succeeded yet.
   */
  NoGame = "no-game",
  /**
   * `newGame` had no seed and the engine was given no entropy source.
   */
  MissingEntropy = "missing-entropy",
  /**
   * A command handler id is registered twice.
   */
  DuplicateCommandHandler = "duplicate-command-handler",
  /**
   * A query name is registered twice.
   */
  DuplicateQuery = "duplicate-query",
  /**
   * An init hook threw; the previous game was restored.
   */
  InitFailed = "init-failed",
}

/**
 * Thrown for engine host misuse (see {@link GameEngineErrorKind}).
 */
export class GameEngineError extends Error {
  /**
   * Creates the error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description.
   * @param cause - The underlying exception, when one exists.
   */
  constructor(
    public readonly kind: GameEngineErrorKind,
    message: string,
    cause?: Error,
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "GameEngineError";
  }
}
