/**
 * Thrown when save text is not valid JSON, fails validation, is hand-edited into an unknown
 * shape, or cannot be applied (spec 006 US2 AC5, DECISIONS D-05). The game that was running is
 * left untouched.
 */
export class InvalidSaveFormatError extends Error {
  /**
   * Creates the error.
   *
   * @param message - One-line description naming the first problem.
   * @param issues - Every problem found as `path: message` lines (empty for parse errors).
   * @param cause - The underlying exception, when one exists.
   */
  constructor(
    message: string,
    public readonly issues: readonly string[] = [],
    cause?: Error,
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "InvalidSaveFormatError";
  }
}
