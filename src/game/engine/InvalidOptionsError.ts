/**
 * Thrown by `newGame` when the initialisation options fail validation (spec 007 FR-010, US4,
 * DECISIONS D-06). Nothing has been changed when it is thrown; the previous game keeps running.
 */
export class InvalidOptionsError extends Error {
  /**
   * Creates the error.
   *
   * @param issues - One sentence per problem, e.g. `Invalid difficulty: 'x'. Valid values: ...`.
   */
  constructor(public readonly issues: readonly string[]) {
    super(issues.join(" "));
    this.name = "InvalidOptionsError";
  }
}
