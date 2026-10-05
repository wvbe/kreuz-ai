/**
 * Categories of identity system failure.
 */
export enum IdentityErrorKind {
  /**
   * A loaded identity names a name list or skill that the content pack does not define.
   */
  DanglingReference = "dangling-reference",
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
