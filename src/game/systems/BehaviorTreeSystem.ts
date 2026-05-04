/**
 * Behavior tree system: two-layer async model.
 * High-level: async/await for complex sequences.
 * Low-level: tick-driven state machines for real-time execution.
 */

export enum NodeStatus {
  Running = "running",
  Success = "success",
  Failure = "failure",
}

export type BehaviorContext = {
  entityId: number;
  tick: number;
  blackboard: Map<string, unknown>;
};

export type BehaviorNode = {
  nodeType: string;
  name: string;
  execute: (context: BehaviorContext) => NodeStatus;
  children?: BehaviorNode[];
};

/**
 * Creates a sequence node: runs children in order, fails if any child fails.
 */
export function createSequence(name: string, children: BehaviorNode[]): BehaviorNode {
  let currentChild = 0;
  return {
    nodeType: "sequence",
    name,
    children,
    execute(context: BehaviorContext): NodeStatus {
      while (currentChild < children.length) {
        const status = children[currentChild]!.execute(context);
        if (status === NodeStatus.Running) return NodeStatus.Running;
        if (status === NodeStatus.Failure) {
          currentChild = 0;
          return NodeStatus.Failure;
        }
        currentChild++;
      }
      currentChild = 0;
      return NodeStatus.Success;
    },
  };
}

/**
 * Creates a selector node: tries children in order, succeeds if any child succeeds.
 */
export function createSelector(name: string, children: BehaviorNode[]): BehaviorNode {
  let currentChild = 0;
  return {
    nodeType: "selector",
    name,
    children,
    execute(context: BehaviorContext): NodeStatus {
      while (currentChild < children.length) {
        const status = children[currentChild]!.execute(context);
        if (status === NodeStatus.Running) return NodeStatus.Running;
        if (status === NodeStatus.Success) {
          currentChild = 0;
          return NodeStatus.Success;
        }
        currentChild++;
      }
      currentChild = 0;
      return NodeStatus.Failure;
    },
  };
}

/**
 * Creates a condition node: evaluates a predicate.
 */
export function createCondition(
  name: string,
  predicate: (context: BehaviorContext) => boolean,
): BehaviorNode {
  return {
    nodeType: "condition",
    name,
    execute(context: BehaviorContext): NodeStatus {
      return predicate(context) ? NodeStatus.Success : NodeStatus.Failure;
    },
  };
}

/**
 * Creates an action node: performs work over multiple ticks.
 */
export function createAction(
  name: string,
  action: (context: BehaviorContext) => NodeStatus,
): BehaviorNode {
  return {
    nodeType: "action",
    name,
    execute: action,
  };
}

/**
 * Creates a wait node: waits for a number of ticks.
 */
export function createWait(name: string, ticks: number): BehaviorNode {
  let elapsed = 0;
  return {
    nodeType: "wait",
    name,
    execute(_context: BehaviorContext): NodeStatus {
      elapsed++;
      if (elapsed >= ticks) {
        elapsed = 0;
        return NodeStatus.Success;
      }
      return NodeStatus.Running;
    },
  };
}

/**
 * Entity behavior tree component: holds the tree and execution state.
 */
export type BehaviorTreeComponent = {
  tree: BehaviorNode;
  currentStatus: NodeStatus;
};

/**
 * Ticks a behavior tree for one frame.
 */
export function tickBehaviorTree(
  component: BehaviorTreeComponent,
  context: BehaviorContext,
): NodeStatus {
  component.currentStatus = component.tree.execute(context);
  return component.currentStatus;
}
