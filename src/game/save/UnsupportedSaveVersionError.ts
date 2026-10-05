/**
 * Thrown when a save was written by a newer build than the running one (spec 006 US3 AC3,
 * DECISIONS D-05). Older saves are migrated instead of rejected.
 */
export class UnsupportedSaveVersionError extends Error {
  /**
   * Creates the error.
   *
   * @param saveVersion - Version found in the save.
   * @param supportedVersion - Highest version this build can read.
   */
  constructor(
    public readonly saveVersion: number,
    public readonly supportedVersion: number,
  ) {
    super(
      `save version ${saveVersion} is newer than the supported version ${supportedVersion} and cannot be loaded`,
    );
    this.name = "UnsupportedSaveVersionError";
  }
}
