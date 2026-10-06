import type { StandingOrderErrorKind } from "./standingTypes";

/**
 * Failure of a standing-order or Steward command; callers branch on `kind`. The message starts
 * with the kind name (the command error of DECISIONS section 3.9) and names the offending order,
 * recipe, board or citizen.
 */
export class StandingOrderError extends Error {
  /**
   * Creates a standing-order error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description (the kind name is put in front of it).
   * @param candidates - The recipe ids of an `AmbiguousRecipe`, else empty.
   */
  constructor(
    public readonly kind: StandingOrderErrorKind,
    message: string,
    public readonly candidates: readonly string[] = [],
  ) {
    super(`${kind}: ${message}`);
    this.name = "StandingOrderError";
  }
}
