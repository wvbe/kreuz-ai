import { describe, expect, it } from "vitest";
import { doneStep } from "./stepResults";
import { TaskErrorKind } from "./TaskError";
import { isValidTaskType, TaskHandlerRegistry } from "./TaskHandlerRegistry";
import type { TaskHandler } from "./taskTypes";

function handler(type: string): TaskHandler {
  return { type, start: () => doneStep(), step: () => doneStep(), cancel: () => undefined };
}

describe("isValidTaskType", () => {
  it("accepts lowercase dot-separated snake_case and rejects the rest", () => {
    expect(isValidTaskType("map.travel")).toBe(true);
    expect(isValidTaskType("govern.steward_audience")).toBe(true);
    expect(isValidTaskType("craft")).toBe(true);
    expect(isValidTaskType("Craft")).toBe(false);
    expect(isValidTaskType("map..travel")).toBe(false);
    expect(isValidTaskType("map-travel")).toBe(false);
    expect(isValidTaskType("")).toBe(false);
  });
});

describe("TaskHandlerRegistry", () => {
  it("registers, finds and lists handlers sorted by type", () => {
    const registry = new TaskHandlerRegistry();
    registry.register(handler("trade.approach"));
    registry.register(handler("map.travel"));
    expect(registry.has("map.travel")).toBe(true);
    expect(registry.has("nothing")).toBe(false);
    expect(registry.require("trade.approach").type).toBe("trade.approach");
    expect(registry.types()).toEqual(["map.travel", "trade.approach"]);
  });

  it("rejects duplicates, invalid types and unknown lookups", () => {
    const registry = new TaskHandlerRegistry();
    registry.register(handler("map.travel"));
    expect(() => registry.register(handler("map.travel"))).toThrow(
      expect.objectContaining({ kind: TaskErrorKind.DuplicateHandler }),
    );
    expect(() => registry.register(handler("Bad Type"))).toThrow(
      expect.objectContaining({ kind: TaskErrorKind.InvalidDefinition }),
    );
    expect(() => registry.require("missing.type")).toThrow(
      expect.objectContaining({ kind: TaskErrorKind.UnknownTaskType }),
    );
  });
});
