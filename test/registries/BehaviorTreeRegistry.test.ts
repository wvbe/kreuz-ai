import { describe, it, expect } from "vitest";
import { createBehaviorTreeRegistry } from "../../src/registries/BehaviorTreeRegistry.js";
import type { BehaviorNode } from "../../src/schemas/behavior-trees.js";

function getMaxDepth(node: BehaviorNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(getMaxDepth));
}

describe("BehaviorTreeRegistry", () => {
  const registry = createBehaviorTreeRegistry();

  it("loads at least 7 behavior trees", () => {
    expect(registry.size).toBeGreaterThanOrEqual(7);
  });

  it("contains the required tree templates", () => {
    expect(registry.has("daily_routine")).toBe(true);
    expect(registry.has("worker_cycle")).toBe(true);
    expect(registry.has("guard_patrol")).toBe(true);
    expect(registry.has("merchant_routine")).toBe(true);
    expect(registry.has("priest_routine")).toBe(true);
    expect(registry.has("livestock_behavior")).toBe(true);
    expect(registry.has("predator_behavior")).toBe(true);
  });

  it("all trees have depth <= 5", () => {
    for (const tree of registry.getAll()) {
      const depth = getMaxDepth(tree.root);
      expect(depth).toBeLessThanOrEqual(5);
    }
  });

  it("all trees have valid root node structure", () => {
    for (const tree of registry.getAll()) {
      expect(["selector", "sequence"]).toContain(tree.root.type);
      expect(tree.root.children).toBeDefined();
      expect(tree.root.children!.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate IDs", () => {
    const all = registry.getAll();
    const ids = all.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
