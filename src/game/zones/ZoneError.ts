/**
 * Categories of zone failure (the command errors of DECISIONS section 3.4).
 */
export enum ZoneErrorKind {
  /**
   * The zone type is not in the content pack.
   */
  UnknownZoneType = "unknown-zone-type",
  /**
   * The zone type is locked behind a settlement tier the settlement has not reached.
   */
  ContentLocked = "content-locked",
  /**
   * A tile already belongs to another zone (`reassign` was not set).
   */
  TileAlreadyZoned = "tile-already-zoned",
  /**
   * A cell is not on the map.
   */
  OutOfBounds = "out-of-bounds",
  /**
   * The map does not exist.
   */
  UnknownMap = "unknown-map",
  /**
   * The zone does not exist.
   */
  UnknownZone = "unknown-zone",
  /**
   * The merge offer does not exist (any more).
   */
  UnknownOffer = "unknown-offer",
  /**
   * A furniture requirement expression is not valid.
   */
  InvalidRequirement = "invalid-requirement",
}

/**
 * Failure of the zones module; callers branch on `kind`.
 */
export class ZoneError extends Error {
  /**
   * Creates a zone error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending zone, cell or type.
   */
  constructor(
    public readonly kind: ZoneErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ZoneError";
  }
}
