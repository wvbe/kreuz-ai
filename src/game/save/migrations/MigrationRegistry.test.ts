import { describe, expect, it } from "vitest";
import { InvalidSaveFormatError } from "../InvalidSaveFormatError";
import { MigrationRegistry } from "./MigrationRegistry";

function createChain(): MigrationRegistry {
  const registry = new MigrationRegistry();
  registry.register({
    fromVersion: 0,
    description: "add first",
    migrate: (root) => ({ ...root, first: 1 }),
  });
  registry.register({
    fromVersion: 1,
    description: "add second from first",
    migrate: (root) => ({ ...root, second: Number(root["first"]) + 1 }),
  });
  return registry;
}

describe("MigrationRegistry", () => {
  it("runs steps in order and stamps the target version", () => {
    const migrated = createChain().migrate({ version: 0 }, 0, 2);
    expect(migrated).toEqual({ version: 2, first: 1, second: 2 });
  });

  it("starts in the middle of the chain", () => {
    expect(createChain().migrate({ version: 1, first: 5 }, 1, 2)).toEqual({
      version: 2,
      first: 5,
      second: 6,
    });
  });

  it("does not modify the input and returns it unchanged when already current", () => {
    const input = { version: 0, nested: { x: 1 } };
    createChain().migrate(input, 0, 2);
    expect(input).toEqual({ version: 0, nested: { x: 1 } });
    expect(createChain().migrate({ version: 2 }, 2, 2)).toEqual({ version: 2 });
  });

  it("reports a gap in the chain as an invalid save", () => {
    const registry = new MigrationRegistry();
    registry.register({ fromVersion: 1, description: "x", migrate: (root) => root });
    expect(() => registry.migrate({ version: 0 }, 0, 2)).toThrow(InvalidSaveFormatError);
  });

  it("tells which ranges it covers", () => {
    const registry = createChain();
    expect(registry.covers(0, 2)).toBe(true);
    expect(registry.covers(1, 2)).toBe(true);
    expect(registry.covers(0, 3)).toBe(false);
    expect(registry.covers(2, 2)).toBe(true);
  });

  it("rejects duplicate and invalid registrations", () => {
    const registry = createChain();
    expect(() =>
      registry.register({ fromVersion: 0, description: "dup", migrate: (root) => root }),
    ).toThrow(/already registered/);
    expect(() =>
      registry.register({ fromVersion: -1, description: "neg", migrate: (root) => root }),
    ).toThrow(/non-negative/);
  });
});
