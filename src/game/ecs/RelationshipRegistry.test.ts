import { describe, expect, it } from "vitest";
import { EcsError, EcsErrorKind } from "./EcsError";
import { RelationshipDirection, RelationshipRegistry } from "./RelationshipRegistry";

describe("RelationshipRegistry", () => {
  it("registers single definitions and returns copies", () => {
    const registry = new RelationshipRegistry();
    registry.register({
      name: "leader",
      component: "Faction",
      field: "leaderId",
      direction: RelationshipDirection.Forward,
      many: false,
    });
    const definition = registry.require("leader");
    expect(definition).toEqual({
      name: "leader",
      component: "Faction",
      field: "leaderId",
      direction: "forward",
      many: false,
    });
    definition.field = "changed";
    expect(registry.require("leader").field).toBe("leaderId");
    expect(registry.has("leader")).toBe(true);
    expect(registry.has("other")).toBe(false);
  });

  it("registerPair adds a forward list and a derived inverse", () => {
    const registry = new RelationshipRegistry();
    registry.registerPair({
      forwardName: "factions",
      inverseName: "members",
      component: "Citizen",
      field: "factions",
      forwardMany: true,
    });
    expect(registry.require("factions").direction).toBe(RelationshipDirection.Forward);
    expect(registry.require("members")).toMatchObject({
      direction: RelationshipDirection.Inverse,
      field: "factions",
      many: true,
    });
    expect(registry.forwardDefinitions().map((definition) => definition.name)).toEqual([
      "factions",
    ]);
  });

  it("honours inverseMany false", () => {
    const registry = new RelationshipRegistry();
    registry.registerPair({
      forwardName: "home",
      inverseName: "resident",
      component: "Citizen",
      field: "homeDwellingId",
      forwardMany: false,
      inverseMany: false,
    });
    expect(registry.require("resident").many).toBe(false);
  });

  it("rejects duplicates, empty names and unknown lookups", () => {
    const registry = new RelationshipRegistry();
    const base = {
      name: "owner",
      component: "Item",
      field: "ownerId",
      direction: RelationshipDirection.Forward,
      many: false,
    };
    registry.register(base);
    expect(() => registry.register(base)).toThrow(EcsError);
    expect(() => registry.register({ ...base, name: "" })).toThrow(EcsError);
    expect(() => registry.register({ ...base, name: "other", field: "" })).toThrow(EcsError);
    try {
      registry.require("nope");
    } catch (failure) {
      expect((failure as EcsError).kind).toBe(EcsErrorKind.UnknownRelationship);
    }
  });

  it("is per instance", () => {
    const first = new RelationshipRegistry();
    first.registerPair({
      forwardName: "a",
      inverseName: "b",
      component: "C",
      field: "f",
      forwardMany: true,
    });
    expect(new RelationshipRegistry().has("a")).toBe(false);
  });
});
