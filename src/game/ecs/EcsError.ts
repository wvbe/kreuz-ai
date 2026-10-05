/**
 * Categories of ECS failure; callers branch on these instead of parsing messages.
 */
export enum EcsErrorKind {
  InvalidDefinition = "invalid-definition",
  DuplicateDefinition = "duplicate-definition",
  UnknownComponent = "unknown-component",
  UnknownPrototype = "unknown-prototype",
  UnknownEntity = "unknown-entity",
  UnknownRelationship = "unknown-relationship",
  ComponentExists = "component-exists",
  MissingComponent = "missing-component",
  InvalidComponentData = "invalid-component-data",
  NotJson = "not-json",
  InvalidPath = "invalid-path",
  DanglingReference = "dangling-reference",
  InvalidState = "invalid-state",
}

/**
 * Thrown by the entity, component, prototype, query and relationship modules for programmer
 * errors and corrupt saved state. Domain failures at the command layer use result objects instead.
 */
export class EcsError extends Error {
  /**
   * Creates an ECS error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending input.
   */
  constructor(
    public readonly kind: EcsErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "EcsError";
  }
}
