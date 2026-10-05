/**
 * Categories of map failure; callers branch on these instead of parsing messages.
 */
export enum MapErrorKind {
  InvalidDefinition = "invalid-definition",
  DuplicateTerrain = "duplicate-terrain",
  UnknownTerrain = "unknown-terrain",
  UnknownMap = "unknown-map",
  OutOfBounds = "out-of-bounds",
  NotTraversable = "not-traversable",
  InvalidParams = "invalid-params",
  InvalidLink = "invalid-link",
  MapInUse = "map-in-use",
  UnknownOccupant = "unknown-occupant",
  InvalidState = "invalid-state",
}

/**
 * Thrown for programmer errors and corrupt saved state in the map modules. Placing an entity in a
 * blocked cell throws {@link MapErrorKind.NotTraversable} (spec 004: "clear error").
 */
export class MapError extends Error {
  /**
   * Creates a map error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending input.
   */
  constructor(
    public readonly kind: MapErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "MapError";
  }
}
