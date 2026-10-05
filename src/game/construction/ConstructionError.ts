/**
 * Categories of construction failure (the command errors of DECISIONS section 3.3).
 */
export enum ConstructionErrorKind {
  /**
   * The build definition (furniture, wall or door id) is not in the content pack
   * (`UnknownPrototype`).
   */
  UnknownPrototype = "unknown-prototype",
  /**
   * The definition is locked behind a settlement tier the settlement has not reached
   * (`ContentLocked`, spec 027 FR-008).
   */
  ContentLocked = "content-locked",
  /**
   * The terrain of the cell cannot be built on (`LocationBlocked`).
   */
  LocationBlocked = "location-blocked",
  /**
   * An entity or another job already holds the cell (`LocationAlreadyOccupied`).
   */
  LocationAlreadyOccupied = "location-already-occupied",
  /**
   * The map does not exist or the cell is not on it (`OutOfBounds`).
   */
  OutOfBounds = "out-of-bounds",
  /**
   * The entity to take down does not exist (`UnknownEntity`).
   */
  UnknownEntity = "unknown-entity",
  /**
   * The entity cannot be taken down (`NotRemovable`).
   */
  NotRemovable = "not-removable",
  /**
   * The construction job does not exist (`UnknownJob`).
   */
  UnknownJob = "unknown-job",
}

/**
 * Failure of the construction module; callers branch on `kind`.
 */
export class ConstructionError extends Error {
  /**
   * Creates a construction error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending job, cell or definition.
   */
  constructor(
    public readonly kind: ConstructionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ConstructionError";
  }
}
