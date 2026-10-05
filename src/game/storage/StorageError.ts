/**
 * Categories of storage failure.
 */
export enum StorageErrorKind {
  /**
   * The entity does not exist or has no inventory (command error `UnknownEntity`).
   */
  UnknownEntity = "unknown-entity",
  /**
   * A filter names a category the content pack lacks (command error `UnknownCategory`).
   */
  UnknownCategory = "unknown-category",
  /**
   * A filter names a material the content pack lacks (command error `UnknownMaterial`).
   */
  UnknownMaterial = "unknown-material",
  /**
   * The entity is not a stockpile (command error `NotAStockpile`).
   */
  NotAStockpile = "not-a-stockpile",
  /**
   * The quantity is not a positive integer.
   */
  InvalidQuantity = "invalid-quantity",
  /**
   * Less unreserved stock than the reservation asks for.
   */
  InsufficientStock = "insufficient-stock",
  /**
   * The reservation does not exist (any more).
   */
  UnknownReservation = "unknown-reservation",
}

/**
 * Failure of the storage module; callers branch on `kind`.
 */
export class StorageError extends Error {
  /**
   * Creates a storage error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending entity or reservation.
   */
  constructor(
    public readonly kind: StorageErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}
