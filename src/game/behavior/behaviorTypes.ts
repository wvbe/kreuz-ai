import type { Entity, EntityId } from "../ecs/Entity";
import type { EntityStore } from "../ecs/EntityStore";
import type { EventBus } from "../engine/EventBus";

/**
 * The four node types of the behavior DSL (spec 013 FR-013, spec 022 FR-014). The enum value is
 * the `type` field of the JSON node.
 */
export enum BehaviorNodeType {
  Selector = "selector",
  Sequence = "sequence",
  Condition = "condition",
  Action = "action",
}

/**
 * What a behavior node (and therefore a whole tree tick) returns.
 */
export enum NodeStatus {
  Success = "success",
  Failure = "failure",
  Running = "running",
}

/**
 * Maximum depth of one behavior tree; the root node has depth 1 (spec 013 FR-013, SC-012).
 */
export const maxBehaviorDepth = 5;

/**
 * Maximum number of `run_tree` references that may be nested along one chain of trees.
 */
export const maxSubTreeNesting = 8;

/**
 * Id of the built-in action that runs another tree: `{ "type": "action", "id": "run_tree",
 * "params": { "treeId": "..." } }` (DECISIONS D-15). The interpreter handles it structurally, so
 * the sub-tree's running node is part of the saved path.
 */
export const runTreeActionId = "run_tree";

/**
 * Optional per-node parameters handed to the condition or action.
 */
export type BehaviorParams = { [key: string]: string | number };

/**
 * A selector node: tries its children in order until one succeeds (fallback).
 */
export type SelectorNode = {
  type: BehaviorNodeType.Selector;
  children: BehaviorNode[];
};

/**
 * A sequence node: runs its children in order until one fails.
 */
export type SequenceNode = {
  type: BehaviorNodeType.Sequence;
  children: BehaviorNode[];
};

/**
 * A selector or sequence node.
 */
export type CompositeNode = SelectorNode | SequenceNode;

/**
 * A condition leaf that names an engine-registered condition.
 */
export type ConditionNode = {
  type: BehaviorNodeType.Condition;
  id: string;
  params?: BehaviorParams;
};

/**
 * An action leaf that names an engine-registered action (or `run_tree`).
 */
export type ActionNode = {
  type: BehaviorNodeType.Action;
  id: string;
  params?: BehaviorParams;
};

/**
 * A condition or action leaf.
 */
export type LeafNode = ConditionNode | ActionNode;

/**
 * One node of a behavior tree: the JSON DSL, authored in content files.
 */
export type BehaviorNode = CompositeNode | LeafNode;

/**
 * A named behavior tree definition. Definitions are content: loaded once, immutable, never saved.
 */
export type BehaviorTreeDefinition = {
  id: string;
  root: BehaviorNode;
};

/**
 * What a registered condition or action sees when its node is evaluated.
 */
export type BehaviorContext = {
  entityId: EntityId;
  entity: Entity;
  tick: number;
  params: BehaviorParams;
  store: EntityStore;
  bus: EventBus;
};

/**
 * A registered condition or action. `Running` means "call me again next tick with the same
 * context"; any progress it needs must live in components (typically a task it enqueued).
 */
export type BehaviorHandler = (context: BehaviorContext) => NodeStatus;

/**
 * Result of one interpreter tick: the status of the root and, while `Running`, the child-index
 * path from the root to the running leaf (through `run_tree` nodes via index 0).
 */
export type TreeTickResult = {
  status: NodeStatus;
  path: number[];
};
