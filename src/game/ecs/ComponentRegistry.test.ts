import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ComponentRegistry, defineComponent, isValidComponentName } from "./ComponentRegistry";
import type { ComponentDataOf } from "./ComponentRegistry";
import { EcsError, EcsErrorKind } from "./EcsError";

const healthSchema = z.object({ valueMilli: z.number().int().min(0).max(100000) }).strict();
const health = defineComponent("Health", healthSchema, () => ({ valueMilli: 100000 }));

describe("isValidComponentName", () => {
  it("requires PascalCase letters and digits", () => {
    expect(isValidComponentName("TaskQueue")).toBe(true);
    expect(isValidComponentName("Mood2")).toBe(true);
    expect(isValidComponentName("taskQueue")).toBe(false);
    expect(isValidComponentName("Task_Queue")).toBe(false);
    expect(isValidComponentName("")).toBe(false);
  });
});

describe("defineComponent", () => {
  it("returns a definition with defaults satisfying the schema", () => {
    expect(health.name).toBe("Health");
    expect(health.defaults()).toEqual({ valueMilli: 100000 });
    const data: ComponentDataOf<typeof health> = health.defaults();
    expect(data.valueMilli).toBe(100000);
  });

  it("returns a fresh defaults object per call", () => {
    expect(health.defaults()).not.toBe(health.defaults());
  });

  it("rejects bad names and defaults that violate the schema", () => {
    expect(() => defineComponent("health", healthSchema, () => ({ valueMilli: 1 }))).toThrow(
      EcsError,
    );
    expect(() => defineComponent("Broken", healthSchema, () => ({ valueMilli: -5 }))).toThrow(
      EcsError,
    );
  });
});

describe("ComponentRegistry", () => {
  it("registers, finds and lists definitions sorted by name", () => {
    const registry = new ComponentRegistry();
    const zed = defineComponent("Zed", z.object({}).strict(), () => ({}));
    registry.register(zed);
    registry.register(health);
    expect(registry.has("Health")).toBe(true);
    expect(registry.has("Nope")).toBe(false);
    expect(registry.require("Zed")).toBe(zed);
    expect(registry.list().map((definition) => definition.name)).toEqual(["Health", "Zed"]);
  });

  it("is per instance: a second registry does not see the first", () => {
    const first = new ComponentRegistry();
    first.register(health);
    expect(new ComponentRegistry().has("Health")).toBe(false);
  });

  it("rejects duplicates and unknown names", () => {
    const registry = new ComponentRegistry();
    registry.register(health);
    expect(() => registry.register(health)).toThrow(EcsError);
    try {
      registry.require("Missing");
      expect.unreachable();
    } catch (failure) {
      expect((failure as EcsError).kind).toBe(EcsErrorKind.UnknownComponent);
    }
  });

  it("validate returns an independent copy and rejects invalid data", () => {
    const registry = new ComponentRegistry();
    registry.register(health);
    const input = { valueMilli: 5 };
    const output = registry.validate("Health", input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(() => registry.validate("Health", { valueMilli: 1.5 })).toThrow(EcsError);
    expect(() => registry.validate("Health", { valueMilli: 1, extra: 2 })).toThrow(EcsError);
    expect(() => registry.validate("Health", "text")).toThrow(EcsError);
    expect(() => registry.validate("Nope", {})).toThrow(EcsError);
  });
});
