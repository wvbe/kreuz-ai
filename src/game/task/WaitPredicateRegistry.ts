import type { JsonValue } from "../engine/EventBus";
import type { EntityId } from "../ecs/Entity";
import type { EntityStore } from "../ecs/EntityStore";
import { TaskError, TaskErrorKind } from "./TaskError";

/**
 * What a wait predicate may look at: the waiting entity, the tick and the entity store. It must
 * be a pure function of game state.
 */
export type WaitPredicateContext = {
  entityId: EntityId;
  tick: number;
  store: EntityStore;
};

/**
 * A registered, named condition that a `Predicate` wait refers to by id; the condition itself is
 * serialized as `{ predicateId, params }`, never as code.
 */
export type WaitPredicate = (context: WaitPredicateContext, params: JsonValue) => boolean;

const predicateIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/**
 * Per-engine registry of wait predicates keyed by id.
 */
export class WaitPredicateRegistry {
  private readonly predicates = new Map<string, WaitPredicate>();

  /**
   * Adds a predicate; each id can be registered once.
   *
   * @param predicateId - Lowercase dot-separated snake_case id.
   * @param predicate - The pure condition function.
   */
  register(predicateId: string, predicate: WaitPredicate): void {
    if (!predicateIdPattern.test(predicateId)) {
      throw new TaskError(
        TaskErrorKind.InvalidDefinition,
        `predicate id "${predicateId}" must be lowercase dot-separated snake_case`,
      );
    }
    if (this.predicates.has(predicateId)) {
      throw new TaskError(
        TaskErrorKind.DuplicateHandler,
        `predicate "${predicateId}" is already registered`,
      );
    }
    this.predicates.set(predicateId, predicate);
  }

  /**
   * Tells whether a predicate id is registered.
   *
   * @param predicateId - Predicate id.
   * @returns True when registered.
   */
  has(predicateId: string): boolean {
    return this.predicates.has(predicateId);
  }

  /**
   * Evaluates a predicate, throwing for unknown ids.
   *
   * @param predicateId - Predicate id.
   * @param context - Entity, tick and store.
   * @param params - JSON parameters stored in the wait condition.
   * @returns True when the waiting task may wake.
   */
  evaluate(predicateId: string, context: WaitPredicateContext, params: JsonValue): boolean {
    const predicate = this.predicates.get(predicateId);
    if (!predicate) {
      throw new TaskError(
        TaskErrorKind.InvalidWait,
        `wait predicate "${predicateId}" is not registered`,
      );
    }
    return predicate(context, params);
  }
}
