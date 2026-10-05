/**
 * Categories of behavior tree failure; callers branch on these instead of parsing messages.
 */
export enum BehaviorErrorKind {
  InvalidTree = "invalid-tree",
  InvalidDefinition = "invalid-definition",
  DuplicateTree = "duplicate-tree",
  DuplicateHandler = "duplicate-handler",
  UnknownHandler = "unknown-handler",
  UnknownTree = "unknown-tree",
  CyclicTree = "cyclic-tree",
  NoTree = "no-tree",
  InvalidState = "invalid-state",
}

/**
 * Thrown for invalid tree definitions at load time and for corrupt saved interpreter state.
 */
export class BehaviorError extends Error {
  /**
   * Creates a behavior error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending tree, node or id.
   */
  constructor(
    public readonly kind: BehaviorErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "BehaviorError";
  }
}
