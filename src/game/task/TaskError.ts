/**
 * Categories of task runtime failure.
 */
export enum TaskErrorKind {
  UnknownTaskType = "unknown-task-type",
  DuplicateHandler = "duplicate-handler",
  InvalidDefinition = "invalid-definition",
  NoTaskQueue = "no-task-queue",
  UnknownTask = "unknown-task",
  InvalidWait = "invalid-wait",
  InvalidState = "invalid-state",
}

/**
 * Thrown for programmer errors and corrupt saved state in the task runtime. Expected task
 * failures (unreachable target ...) are `Fail` step results, not exceptions.
 */
export class TaskError extends Error {
  /**
   * Creates a task error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending input.
   */
  constructor(
    public readonly kind: TaskErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "TaskError";
  }
}
