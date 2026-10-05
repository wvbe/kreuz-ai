/**
 * Categories of system registration failure.
 */
export enum SystemRegistryErrorKind {
  InvalidDefinition = "invalid-definition",
  DuplicateSystem = "duplicate-system",
  MissingDependency = "missing-dependency",
  DependencyCycle = "dependency-cycle",
}

/**
 * Thrown by the system registry (spec 007 FR-015, SC-008). A missing dependency or a cycle is
 * reported before any game state is touched.
 */
export class SystemRegistryError extends Error {
  /**
   * Creates the error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the systems involved.
   */
  constructor(
    public readonly kind: SystemRegistryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SystemRegistryError";
  }
}
