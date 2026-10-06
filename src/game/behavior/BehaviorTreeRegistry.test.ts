import { describe, expect, it } from "vitest";
import { BehaviorErrorKind } from "./BehaviorError";
import { BehaviorHandlerRegistry } from "./BehaviorHandlerRegistry";
import { BehaviorTreeRegistry, subTreeReference } from "./BehaviorTreeRegistry";
import { BehaviorNodeType, NodeStatus, maxSubTreeNesting } from "./behaviorTypes";
import type { BehaviorNode, BehaviorTreeDefinition } from "./behaviorTypes";

function handlers(): BehaviorHandlerRegistry {
  const registry = new BehaviorHandlerRegistry();
  registry.registerCondition("is_starving", () => NodeStatus.Success);
  registry.registerAction("beg", () => NodeStatus.Success);
  registry.registerAction("work", () => NodeStatus.Success);
  return registry;
}

function action(id: string, treeId?: string): BehaviorNode {
  return treeId === undefined
    ? { type: BehaviorNodeType.Action, id }
    : { type: BehaviorNodeType.Action, id, params: { treeId } };
}

function nested(depth: number): BehaviorNode {
  return depth <= 1
    ? action("work")
    : { type: BehaviorNodeType.Sequence, children: [nested(depth - 1)] };
}

function reference(from: string, target: string): BehaviorTreeDefinition {
  return { id: from, root: action("run_tree", target) };
}

// @covers 013:FR-013 013:FR-015 013:FR-016 013:FR-017 013:SC-008
describe("BehaviorTreeRegistry.register", () => {
  it("registers the 'if starving then beg, else work' tree from JSON", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    const json = JSON.stringify({
      id: "villager",
      root: {
        type: "selector",
        children: [
          {
            type: "sequence",
            children: [
              { type: "condition", id: "is_starving" },
              { type: "action", id: "beg" },
            ],
          },
          { type: "action", id: "work" },
        ],
      },
    });
    registry.register(JSON.parse(json));
    expect(registry.has("villager")).toBe(true);
    expect(registry.require("villager").id).toBe("villager");
    expect(registry.ids()).toEqual(["villager"]);
  });

  it("accepts depth 5 and rejects depth 6 (SC-012)", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    registry.register({ id: "depth_five", root: nested(5) });
    expect(() => registry.register({ id: "depth_six", root: nested(6) })).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.InvalidTree }),
    );
    expect(registry.has("depth_six")).toBe(false);
  });

  it("rejects malformed trees and unknown handlers at load", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    const malformed = [
      { id: "Bad Id", root: action("work") },
      { id: "empty", root: { type: "sequence", children: [] } },
      { id: "wrong_type", root: { type: "loop", children: [action("work")] } },
      { id: "extra_field", root: { type: "action", id: "work", speed: 3 } },
      { id: "bad_params", root: { type: "action", id: "work", params: { amount: 1.5 } } },
    ];
    for (const tree of malformed) {
      expect(() => registry.register(tree as never)).toThrow(
        expect.objectContaining({ kind: BehaviorErrorKind.InvalidTree }),
      );
    }
    expect(() => registry.register({ id: "no_such_action", root: action("teleport") })).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.UnknownHandler }),
    );
    expect(() =>
      registry.register({
        id: "no_such_condition",
        root: { type: BehaviorNodeType.Condition, id: "is_flying" },
      }),
    ).toThrow(expect.objectContaining({ kind: BehaviorErrorKind.UnknownHandler }));
    expect(registry.ids()).toEqual([]);
  });

  it("rejects duplicate tree ids across registrations and inside one batch", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    registry.register({ id: "same_name", root: action("work") });
    expect(() => registry.register({ id: "same_name", root: action("beg") })).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.DuplicateTree }),
    );
    expect(() =>
      registry.registerAll([
        { id: "twin", root: action("work") },
        { id: "twin", root: action("work") },
      ]),
    ).toThrow(expect.objectContaining({ kind: BehaviorErrorKind.DuplicateTree }));
  });
});

describe("BehaviorTreeRegistry.registerAll and sub-trees", () => {
  it("resolves references inside a batch and in earlier registrations", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    registry.registerAll([reference("first", "second"), { id: "second", root: action("work") }]);
    registry.register(reference("third", "first"));
    expect(registry.ids()).toEqual(["first", "second", "third"]);
  });

  it("rejects references to unknown trees and invalid run_tree params", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    expect(() => registry.register(reference("lonely", "ghost"))).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.UnknownTree }),
    );
    expect(() => registry.register({ id: "no_param", root: action("run_tree") })).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.InvalidTree }),
    );
  });

  it("rejects cycles, including self references and cycles through earlier trees", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    expect(() => registry.register(reference("ouroboros", "ouroboros"))).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.CyclicTree }),
    );
    expect(() =>
      registry.registerAll([
        reference("alpha", "beta"),
        reference("beta", "gamma"),
        reference("gamma", "alpha"),
      ]),
    ).toThrow(/alpha -> beta -> gamma -> alpha/);
    expect(registry.ids()).toEqual([]);
  });

  it("is atomic: one invalid tree in a batch registers nothing", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    expect(() =>
      registry.registerAll([
        { id: "fine", root: action("work") },
        { id: "broken", root: action("teleport") },
      ]),
    ).toThrow();
    expect(registry.has("fine")).toBe(false);
  });

  it("limits how deep run_tree references may be chained", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    const chain: BehaviorTreeDefinition[] = [{ id: "tree_0", root: action("work") }];
    for (let level = 1; level <= maxSubTreeNesting; level += 1) {
      chain.push(reference(`tree_${level}`, `tree_${level - 1}`));
    }
    registry.registerAll(chain);
    expect(() =>
      registry.register(reference("tree_too_deep", `tree_${maxSubTreeNesting}`)),
    ).toThrow(expect.objectContaining({ kind: BehaviorErrorKind.InvalidTree }));
  });

  it("throws for unknown ids on lookup", () => {
    const registry = new BehaviorTreeRegistry(handlers());
    expect(() => registry.require("ghost")).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.UnknownTree }),
    );
  });
});

describe("subTreeReference", () => {
  it("reads the tree id of run_tree actions only", () => {
    expect(subTreeReference(action("run_tree", "other"))).toBe("other");
    expect(subTreeReference(action("run_tree"))).toBeNull();
    expect(subTreeReference(action("work", "other"))).toBeNull();
    expect(subTreeReference({ type: BehaviorNodeType.Condition, id: "run_tree" })).toBeNull();
    expect(
      subTreeReference({ type: BehaviorNodeType.Action, id: "run_tree", params: { treeId: 3 } }),
    ).toBeNull();
  });
});
