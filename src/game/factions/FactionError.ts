/**
 * Categories of faction system failure.
 */
export enum FactionErrorKind {
  /**
   * A loaded reference names a faction or citizen that does not exist or lacks the needed
   * component (spec 021 edge cases).
   */
  DanglingReference = "dangling-reference",
  /**
   * The entity is not a faction.
   */
  UnknownFaction = "unknown-faction",
  /**
   * The entity is not a citizen (it has no `Citizen` component).
   */
  NotCitizen = "not-citizen",
  /**
   * A leader must be a member of the faction (command error `NotMember`).
   */
  NotMember = "not-member",
}

/**
 * Failure of the faction system; callers branch on `kind`.
 */
export class FactionError extends Error {
  /**
   * Creates a faction error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending entity.
   */
  constructor(
    public readonly kind: FactionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "FactionError";
  }
}
