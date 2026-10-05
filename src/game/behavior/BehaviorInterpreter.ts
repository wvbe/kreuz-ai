import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { EntityStore } from "../ecs/EntityStore";
import type { EventBus } from "../engine/EventBus";
import { aiStateComponent } from "./aiStateComponent";
import type { AiStateData } from "./aiStateComponent";
import { BehaviorError, BehaviorErrorKind } from "./BehaviorError";
import type { BehaviorHandlerRegistry } from "./BehaviorHandlerRegistry";
import { subTreeReference } from "./BehaviorTreeRegistry";
import type { BehaviorTreeRegistry } from "./BehaviorTreeRegistry";
import { BehaviorNodeType, NodeStatus } from "./behaviorTypes";
import type { BehaviorNode, TreeTickResult } from "./behaviorTypes";

/**
 * Everything a {@link BehaviorInterpreter} needs; all instances are owned by one engine.
 */
export type BehaviorInterpreterOptions = {
  store: EntityStore;
  bus: EventBus;
  trees: BehaviorTreeRegistry;
  handlers: BehaviorHandlerRegistry;
};

type RunState = {
  entity: Entity;
  aiState: AiStateData;
  tick: number;
};

/**
 * Executes behavior trees (spec 013 FR-012/013) with memory: when a leaf returns `Running`, the
 * path of child indices from the root to that leaf is stored in the entity's `AiState`
 * component and the next tick resumes at that leaf instead of re-evaluating from the root. A
 * selector therefore keeps the child it chose and a sequence keeps its position, and everything
 * round-trips through JSON. Sub-trees (`run_tree`) are expanded on the fly; the path continues
 * into the referenced tree through child index 0.
 *
 * One tick evaluates nodes until a leaf returns `Running` or the root finishes; there are no
 * loops, so evaluation is bounded by the tree size. When the root finishes (success or failure)
 * the stored path is cleared and the next tick starts again at the root.
 */
export class BehaviorInterpreter {
  /**
   * Creates an interpreter.
   *
   * @param options - Store, bus and the registries of trees and handlers.
   */
  constructor(private readonly options: BehaviorInterpreterOptions) {}

  /**
   * Gives an entity a behavior tree (spec 013 FR-021) and resets its running state. The entity
   * needs an `AiState` component.
   *
   * @param entityId - Entity to configure.
   * @param treeId - Registered tree id.
   */
  setTree(entityId: EntityId, treeId: string): void {
    this.options.trees.require(treeId);
    const aiState = this.requireState(this.options.store.require(entityId));
    aiState.treeId = treeId;
    aiState.currentNode = [];
    aiState.running = false;
  }

  /**
   * Advances an entity's tree by one tick: resumes the stored running leaf or starts at the root.
   *
   * @param entityId - Entity to run.
   * @param tick - The tick being processed.
   * @returns The root status and, while running, the new running path.
   */
  tick(entityId: EntityId, tick: number): TreeTickResult {
    const entity = this.options.store.require(entityId);
    const aiState = this.requireState(entity);
    if (aiState.treeId === null) {
      throw new BehaviorError(BehaviorErrorKind.NoTree, `entity ${entityId} has no behavior tree`);
    }
    const root = this.options.trees.require(aiState.treeId).root;
    const resume = aiState.running ? [...aiState.currentNode] : null;
    if (resume !== null) {
      this.validatePath(root, resume, entityId);
    }
    const result = this.evaluate(root, resume, { entity, aiState, tick });
    aiState.running = result.status === NodeStatus.Running;
    aiState.currentNode = aiState.running ? result.path : [];
    return result;
  }

  private requireState(entity: Entity): AiStateData {
    const aiState = getComponent(entity, aiStateComponent);
    if (!aiState) {
      throw new BehaviorError(
        BehaviorErrorKind.NoTree,
        `entity ${entity.id} has no AiState component`,
      );
    }
    return aiState;
  }

  private childrenOf(node: BehaviorNode): BehaviorNode[] | null {
    if (node.type === BehaviorNodeType.Selector || node.type === BehaviorNodeType.Sequence) {
      return node.children;
    }
    const reference = subTreeReference(node);
    return reference === null ? null : [this.options.trees.require(reference).root];
  }

  private validatePath(root: BehaviorNode, path: number[], entityId: EntityId): void {
    let node = root;
    for (const index of path) {
      const child = this.childrenOf(node)?.[index];
      if (!child) {
        throw new BehaviorError(
          BehaviorErrorKind.InvalidState,
          `entity ${entityId}: saved path [${path.join(",")}] does not exist in its behavior tree`,
        );
      }
      node = child;
    }
    if (this.childrenOf(node) !== null) {
      throw new BehaviorError(
        BehaviorErrorKind.InvalidState,
        `entity ${entityId}: saved path [${path.join(",")}] does not end at a leaf`,
      );
    }
  }

  private evaluate(node: BehaviorNode, resume: number[] | null, state: RunState): TreeTickResult {
    const children = this.childrenOf(node);
    if (children === null) {
      return { status: this.runLeaf(node, state), path: [] };
    }
    const isSelector = node.type === BehaviorNodeType.Selector;
    const start = resume?.[0] ?? 0;
    for (let index = start; index < children.length; index += 1) {
      const childResume = resume !== null && index === start ? resume.slice(1) : null;
      const result = this.evaluate(children[index] as BehaviorNode, childResume, state);
      if (result.status === NodeStatus.Running) {
        return { status: NodeStatus.Running, path: [index, ...result.path] };
      }
      if (isSelector && result.status === NodeStatus.Success) {
        return { status: NodeStatus.Success, path: [] };
      }
      if (!isSelector && result.status === NodeStatus.Failure) {
        return { status: NodeStatus.Failure, path: [] };
      }
    }
    return { status: isSelector ? NodeStatus.Failure : NodeStatus.Success, path: [] };
  }

  private runLeaf(node: BehaviorNode, state: RunState): NodeStatus {
    if (node.type !== BehaviorNodeType.Condition && node.type !== BehaviorNodeType.Action) {
      throw new BehaviorError(BehaviorErrorKind.InvalidState, "composite node reached as a leaf");
    }
    const isAction = node.type === BehaviorNodeType.Action;
    const handler = isAction
      ? this.options.handlers.requireAction(node.id)
      : this.options.handlers.requireCondition(node.id);
    if (isAction) {
      state.aiState.lastActionTick = state.tick;
    }
    return handler({
      entityId: state.entity.id,
      entity: state.entity,
      tick: state.tick,
      params: { ...node.params },
      store: this.options.store,
      bus: this.options.bus,
    });
  }
}
