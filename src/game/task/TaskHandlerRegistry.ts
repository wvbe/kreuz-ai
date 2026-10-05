import { TaskError, TaskErrorKind } from "./TaskError";
import type { TaskHandler } from "./taskTypes";

const taskTypePattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/**
 * Tells whether a string is a valid task type id: lowercase dot-separated snake_case segments such
 * as `map.travel` or `govern.steward_audience`.
 *
 * @param type - Candidate task type.
 * @returns True when valid.
 */
export function isValidTaskType(type: string): boolean {
  return taskTypePattern.test(type);
}

/**
 * Per-engine registry of task handlers keyed by task type (no giant switch statements).
 */
export class TaskHandlerRegistry {
  private readonly handlers = new Map<string, TaskHandler>();

  /**
   * Adds a handler; each task type can be registered once.
   *
   * @param handler - The step machine to register.
   */
  register(handler: TaskHandler): void {
    if (!isValidTaskType(handler.type)) {
      throw new TaskError(
        TaskErrorKind.InvalidDefinition,
        `task type "${handler.type}" must be lowercase dot-separated snake_case`,
      );
    }
    if (this.handlers.has(handler.type)) {
      throw new TaskError(
        TaskErrorKind.DuplicateHandler,
        `task type "${handler.type}" is already registered`,
      );
    }
    this.handlers.set(handler.type, handler);
  }

  /**
   * Tells whether a task type has a handler.
   *
   * @param type - Task type.
   * @returns True when registered.
   */
  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Looks up a handler, throwing for unknown types.
   *
   * @param type - Task type.
   * @returns The registered handler.
   */
  require(type: string): TaskHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new TaskError(TaskErrorKind.UnknownTaskType, `task type "${type}" is not registered`);
    }
    return handler;
  }

  /**
   * Lists the registered task types in ascending order.
   *
   * @returns Sorted task type ids.
   */
  types(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
