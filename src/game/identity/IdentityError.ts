/**
 * Categories of identity system failure.
 */
export enum IdentityErrorKind {
  /**
   * A loaded identity names a name list or skill that the content pack does not define.
   */
  DanglingReference = "dangling-reference",
  /**
   * `RenameCitizen` with a given name or byname that fails spec 028 FR-020.
   */
  InvalidName = "InvalidName",
  /**
   * `RenameCitizen` for an entity that is no citizen of the settlement.
   */
  UnknownEntity = "UnknownEntity",
}

/**
 * Failure of the identity system; callers branch on `kind`.
 */
export class IdentityError extends Error {
  /**
   * Creates an identity error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending entity and id.
   */
  constructor(
    public readonly kind: IdentityErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}
