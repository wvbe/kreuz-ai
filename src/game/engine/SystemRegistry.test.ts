import { describe, expect, it } from "vitest";
import { SystemRegistry } from "./SystemRegistry";
import type { SystemRegistration } from "./SystemRegistry";
import { SystemRegistryError, SystemRegistryErrorKind } from "./SystemRegistryError";

type Log = string[];

function system(id: string, dependencies: string[]): SystemRegistration<Log> {
  return {
    id,
    dependencies,
    init: (context) => {
      context.push(id);
    },
  };
}

function kindOf(action: () => void): SystemRegistryErrorKind | null {
  try {
    action();
  } catch (error) {
    return error instanceof SystemRegistryError ? error.kind : null;
  }
  return null;
}

describe("SystemRegistry", () => {
  it("runs init hooks in dependency order, ties by registration order", () => {
    const registry = new SystemRegistry<Log>();
    const log: Log = [];
    registry.register(system("zeta.top", ["alpha.base", "mid.layer"]));
    registry.register(system("mid.layer", ["alpha.base"]));
    registry.register(system("alpha.base", []));
    registry.register(system("free.standing", []));
    expect(registry.runInit(log)).toEqual(["alpha.base", "mid.layer", "zeta.top", "free.standing"]);
    expect(log).toEqual(["alpha.base", "mid.layer", "zeta.top", "free.standing"]);
  });

  it("accepts a dependency registered later", () => {
    const registry = new SystemRegistry<Log>();
    registry.register(system("one.first", ["two.second"]));
    registry.register(system("two.second", []));
    expect(registry.resolveOrder()).toEqual(["two.second", "one.first"]);
  });

  it("rejects a missing dependency before any hook runs", () => {
    const registry = new SystemRegistry<Log>();
    const log: Log = [];
    registry.register(system("one.first", []));
    registry.register(system("two.second", ["ghost.system"]));
    expect(kindOf(() => registry.runInit(log))).toBe(SystemRegistryErrorKind.MissingDependency);
    expect(log).toEqual([]);
    expect(() => registry.resolveOrder()).toThrow(
      'system "two.second" depends on "ghost.system", which is not registered',
    );
  });

  // @covers 007:SC-008
  it("rejects cycles and names them", () => {
    const registry = new SystemRegistry<Log>();
    const log: Log = [];
    registry.register(system("one.first", ["three.third"]));
    registry.register(system("two.second", ["one.first"]));
    registry.register(system("three.third", ["two.second"]));
    registry.register(system("fine.system", []));
    expect(kindOf(() => registry.runInit(log))).toBe(SystemRegistryErrorKind.DependencyCycle);
    expect(log).toEqual([]);
    expect(() => registry.resolveOrder()).toThrow(
      "one.first -> three.third -> two.second -> one.first",
    );
  });

  it("rejects a system that depends on itself", () => {
    const registry = new SystemRegistry<Log>();
    expect(kindOf(() => registry.register({ id: "loop.self", dependencies: ["loop.self"] }))).toBe(
      SystemRegistryErrorKind.DependencyCycle,
    );
  });

  it("rejects duplicate and malformed ids", () => {
    const registry = new SystemRegistry<Log>();
    registry.register({ id: "one.first" });
    expect(kindOf(() => registry.register({ id: "one.first" }))).toBe(
      SystemRegistryErrorKind.DuplicateSystem,
    );
    expect(kindOf(() => registry.register({ id: "Bad Id" }))).toBe(
      SystemRegistryErrorKind.InvalidDefinition,
    );
    expect(registry.has("one.first")).toBe(true);
    expect(registry.has("nope")).toBe(false);
    expect(registry.ids()).toEqual(["one.first"]);
  });

  it("works without hooks or dependencies", () => {
    const registry = new SystemRegistry<Log>();
    registry.register({ id: "quiet.system" });
    expect(registry.runInit([])).toEqual(["quiet.system"]);
  });
});
