import { describe, expect, it } from "vitest";
import { behaviorTreeSchema, measureTreeDepth } from "./behaviorTreeSchema";
import { BehaviorNodeType, maxBehaviorDepth } from "./behaviorTypes";
import type { BehaviorNode } from "./behaviorTypes";

const leaf: BehaviorNode = { type: BehaviorNodeType.Action, id: "work" };

describe("measureTreeDepth", () => {
  it("counts the nodes on the longest root-to-leaf chain", () => {
    expect(measureTreeDepth(leaf)).toBe(1);
    expect(
      measureTreeDepth({
        type: BehaviorNodeType.Selector,
        children: [
          leaf,
          {
            type: BehaviorNodeType.Sequence,
            children: [leaf, { type: BehaviorNodeType.Selector, children: [leaf] }],
          },
        ],
      }),
    ).toBe(4);
  });
});

describe("behaviorTreeSchema", () => {
  it("parses valid JSON trees and keeps optional params", () => {
    const parsed = behaviorTreeSchema.parse({
      id: "tree_a",
      root: { type: "action", id: "work", params: { amount: 3, mode: "fast" } },
    });
    expect(parsed.root).toEqual({
      type: BehaviorNodeType.Action,
      id: "work",
      params: { amount: 3, mode: "fast" },
    });
  });

  it("reports depth violations with the offending depth", () => {
    let node: BehaviorNode = leaf;
    for (let level = 1; level <= maxBehaviorDepth; level += 1) {
      node = { type: BehaviorNodeType.Sequence, children: [node] };
    }
    const result = behaviorTreeSchema.safeParse({ id: "too_deep", root: node });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("depth 6 exceeds the maximum of 5");
  });
});
