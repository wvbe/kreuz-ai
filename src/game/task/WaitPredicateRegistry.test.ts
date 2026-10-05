import { describe, expect, it } from "vitest";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import { EntityStore } from "../ecs/EntityStore";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import { IdCounters } from "../engine/IdCounters";
import { TaskErrorKind } from "./TaskError";
import { WaitPredicateRegistry } from "./WaitPredicateRegistry";

function context(): { entityId: number; tick: number; store: EntityStore } {
  const components = new ComponentRegistry();
  const store = new EntityStore({
    components,
    prototypes: new PrototypeRegistry(components),
    counters: new IdCounters(),
  });
  return { entityId: 1, tick: 7, store };
}

describe("WaitPredicateRegistry", () => {
  it("evaluates a registered predicate with its context and params", () => {
    const registry = new WaitPredicateRegistry();
    registry.register("tick.after", (ctx, params) => ctx.tick > Number(params));
    expect(registry.has("tick.after")).toBe(true);
    expect(registry.evaluate("tick.after", context(), 5)).toBe(true);
    expect(registry.evaluate("tick.after", context(), 9)).toBe(false);
  });

  it("rejects duplicate, invalid and unknown predicate ids", () => {
    const registry = new WaitPredicateRegistry();
    registry.register("a.b", () => true);
    expect(registry.has("missing")).toBe(false);
    expect(() => registry.register("a.b", () => true)).toThrow(
      expect.objectContaining({ kind: TaskErrorKind.DuplicateHandler }),
    );
    expect(() => registry.register("Bad Id", () => true)).toThrow(
      expect.objectContaining({ kind: TaskErrorKind.InvalidDefinition }),
    );
    expect(() => registry.evaluate("missing", context(), null)).toThrow(
      expect.objectContaining({ kind: TaskErrorKind.InvalidWait }),
    );
  });
});
