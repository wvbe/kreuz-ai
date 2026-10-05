import { describe, expect, it } from "vitest";
import type { BehaviorContext } from "./behaviorTypes";
import { NodeStatus } from "./behaviorTypes";
import { BehaviorErrorKind } from "./BehaviorError";
import { BehaviorHandlerRegistry } from "./BehaviorHandlerRegistry";

describe("BehaviorHandlerRegistry", () => {
  it("keeps conditions and actions in separate namespaces", () => {
    const registry = new BehaviorHandlerRegistry();
    registry.registerCondition("is_ready", () => NodeStatus.Success);
    registry.registerAction("is_ready", () => NodeStatus.Failure);
    expect(registry.hasCondition("is_ready")).toBe(true);
    expect(registry.hasAction("is_ready")).toBe(true);
    expect(registry.hasAction("other")).toBe(false);
    expect(registry.requireCondition("is_ready")({} as BehaviorContext)).toBe(NodeStatus.Success);
    expect(registry.requireAction("is_ready")({} as BehaviorContext)).toBe(NodeStatus.Failure);
  });

  it("rejects duplicates, invalid ids, the reserved run_tree id and unknown lookups", () => {
    const registry = new BehaviorHandlerRegistry();
    registry.registerAction("work", () => NodeStatus.Success);
    expect(() => registry.registerAction("work", () => NodeStatus.Success)).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.DuplicateHandler }),
    );
    expect(() => registry.registerCondition("Not Valid", () => NodeStatus.Success)).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.InvalidDefinition }),
    );
    expect(() => registry.registerAction("run_tree", () => NodeStatus.Success)).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.DuplicateHandler }),
    );
    expect(() => registry.requireAction("ghost")).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.UnknownHandler }),
    );
    expect(() => registry.requireCondition("ghost")).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.UnknownHandler }),
    );
  });
});
