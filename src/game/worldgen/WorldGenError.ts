/**
 * Categories of world generation failure; callers branch on these instead of parsing messages.
 */
export enum WorldGenErrorKind {
  MissingTerrain = "missing-terrain",
  Unreachable = "unreachable",
  InvalidOptions = "invalid-options",
  GenerationFailed = "generation-failed",
}

/**
 * Thrown when a generator is given unusable options or cannot produce a valid result within its
 * bounded number of attempts.
 */
export class WorldGenError extends Error {
  /**
   * Creates a world generation error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending input.
   */
  constructor(
    public readonly kind: WorldGenErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "WorldGenError";
  }
}
