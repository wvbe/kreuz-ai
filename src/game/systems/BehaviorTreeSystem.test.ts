import { describe, it, expect } from "vitest";
import {
  createSequence,
  createSelector,
  createCondition,
  createAction,
  createWait,
  tickBehaviorTree,
  NodeStatus,
} from "./BehaviorTreeSystem.js";
import type { BehaviorContext, BehaviorTreeComponent } from "./BehaviorTreeSystem.js";

function createContext(tick: number = 0): BehaviorContext {
  return { entityId: 1, tick, blackboard: new Map() };
}

describe("BehaviorTreeSystem", () => {
  it("sequence runs children in order", () => {
    const order: string[] = [];
    const tree = createSequence("root", [
      createAction("a", () => { order.push("a"); return NodeStatus.Success; }),
      createAction("b", () => { order.push("b"); return NodeStatus.Success; }),
    ]);
    const component: BehaviorTreeComponent = { tree, currentStatus: NodeStatus.Running };
    tickBehaviorTree(component, createContext());
    expect(order).toEqual(["a", "b"]);
    expect(component.currentStatus).toBe(NodeStatus.Success);
  });

  it("sequence fails if any child fails", () => {
    const tree = createSequence("root", [
      createAction("pass", () => NodeStatus.Success),
      createAction("fail", () => NodeStatus.Failure),
      createAction("skip", () => NodeStatus.Success),
    ]);
    const component: BehaviorTreeComponent = { tree, currentStatus: NodeStatus.Running };
    tickBehaviorTree(component, createContext());
    expect(component.currentStatus).toBe(NodeStatus.Failure);
  });

  it("selector succeeds on first success", () => {
    const tree = createSelector("root", [
      createAction("fail", () => NodeStatus.Failure),
      createAction("pass", () => NodeStatus.Success),
      createAction("skip", () => NodeStatus.Success),
    ]);
    const component: BehaviorTreeComponent = { tree, currentStatus: NodeStatus.Running };
    tickBehaviorTree(component, createContext());
    expect(component.currentStatus).toBe(NodeStatus.Success);
  });

  it("condition gates execution", () => {
    let allowed = false;
    const tree = createSequence("root", [
      createCondition("check", () => allowed),
      createAction("do", () => NodeStatus.Success),
    ]);
    const component: BehaviorTreeComponent = { tree, currentStatus: NodeStatus.Running };
    tickBehaviorTree(component, createContext());
    expect(component.currentStatus).toBe(NodeStatus.Failure);

    allowed = true;
    tickBehaviorTree(component, createContext());
    expect(component.currentStatus).toBe(NodeStatus.Success);
  });

  it("wait node runs over multiple ticks", () => {
    const tree = createWait("pause", 3);
    const component: BehaviorTreeComponent = { tree, currentStatus: NodeStatus.Running };
    tickBehaviorTree(component, createContext(1));
    expect(component.currentStatus).toBe(NodeStatus.Running);
    tickBehaviorTree(component, createContext(2));
    expect(component.currentStatus).toBe(NodeStatus.Running);
    tickBehaviorTree(component, createContext(3));
    expect(component.currentStatus).toBe(NodeStatus.Success);
  });
});
