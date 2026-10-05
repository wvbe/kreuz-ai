import { BehaviorError, BehaviorErrorKind } from "./BehaviorError";
import { runTreeActionId } from "./behaviorTypes";
import type { BehaviorHandler } from "./behaviorTypes";

const handlerIdPattern = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Per-engine registry of the condition and action functions that behavior trees refer to by id.
 * Conditions and actions have separate namespaces; `run_tree` is reserved for sub-tree references.
 */
export class BehaviorHandlerRegistry {
  private readonly conditions = new Map<string, BehaviorHandler>();
  private readonly actions = new Map<string, BehaviorHandler>();

  /**
   * Registers a condition.
   *
   * @param id - Lowercase snake_case id, e.g. `is_starving`.
   * @param handler - Function evaluated each time a condition node is reached.
   */
  registerCondition(id: string, handler: BehaviorHandler): void {
    this.add(this.conditions, "condition", id, handler);
  }

  /**
   * Registers an action.
   *
   * @param id - Lowercase snake_case id, e.g. `find_food`; `run_tree` is reserved.
   * @param handler - Function evaluated each time an action node is reached or resumed.
   */
  registerAction(id: string, handler: BehaviorHandler): void {
    if (id === runTreeActionId) {
      throw new BehaviorError(
        BehaviorErrorKind.DuplicateHandler,
        `action id "${runTreeActionId}" is reserved for sub-tree references`,
      );
    }
    this.add(this.actions, "action", id, handler);
  }

  /**
   * Tells whether a condition id is registered.
   *
   * @param id - Condition id.
   * @returns True when registered.
   */
  hasCondition(id: string): boolean {
    return this.conditions.has(id);
  }

  /**
   * Tells whether an action id is registered.
   *
   * @param id - Action id.
   * @returns True when registered.
   */
  hasAction(id: string): boolean {
    return this.actions.has(id);
  }

  /**
   * Looks up a condition, throwing for unknown ids.
   *
   * @param id - Condition id.
   * @returns The registered function.
   */
  requireCondition(id: string): BehaviorHandler {
    const handler = this.conditions.get(id);
    if (!handler) {
      throw new BehaviorError(
        BehaviorErrorKind.UnknownHandler,
        `condition "${id}" is not registered`,
      );
    }
    return handler;
  }

  /**
   * Looks up an action, throwing for unknown ids.
   *
   * @param id - Action id.
   * @returns The registered function.
   */
  requireAction(id: string): BehaviorHandler {
    const handler = this.actions.get(id);
    if (!handler) {
      throw new BehaviorError(BehaviorErrorKind.UnknownHandler, `action "${id}" is not registered`);
    }
    return handler;
  }

  private add(
    target: Map<string, BehaviorHandler>,
    label: string,
    id: string,
    handler: BehaviorHandler,
  ): void {
    if (!handlerIdPattern.test(id)) {
      throw new BehaviorError(
        BehaviorErrorKind.InvalidDefinition,
        `${label} id "${id}" must be lowercase snake_case`,
      );
    }
    if (target.has(id)) {
      throw new BehaviorError(
        BehaviorErrorKind.DuplicateHandler,
        `${label} "${id}" is already registered`,
      );
    }
    target.set(id, handler);
  }
}
