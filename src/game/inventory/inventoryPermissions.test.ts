import { describe, expect, it } from "vitest";
import { AccessDeniedError } from "./InventoryError";
import { assertOperationAllowed, isOperationAllowed } from "./inventoryPermissions";
import { requireInventory } from "./inventoryQueries";
import { InventoryOperation, PermissionTargetKind, PermissionType } from "./inventoryTypes";
import type { ActorResolver, InventoryContext, PermissionRule } from "./inventoryTypes";
import { createInventoryEntity, createTestMaterials } from "./testInventories";

const materials = createTestMaterials();
const resolver: ActorResolver = {
  isInFaction: (actor, factionId) => actor === 20 && factionId === 5,
  hasRole: (actor, role) => actor === 21 && role === "trader",
};

function actingAs(actor: number | null, withResolver = true): InventoryContext {
  return withResolver ? { materials, actor, resolver } : { materials, actor };
}

function rule(
  type: PermissionType,
  target: PermissionRule["target"],
  operation: InventoryOperation,
): PermissionRule {
  return { type, target, operation };
}

const grant = PermissionType.Grant;
const deny = PermissionType.Deny;
const storing = InventoryOperation.Store;
const retrieving = InventoryOperation.Retrieve;

describe("isOperationAllowed", () => {
  // @covers 005:FR-025a
  it("allows everything with no rules and for the system actor", () => {
    const open = createInventoryEntity(1);
    const locked = createInventoryEntity(2, {
      rules: [rule(deny, { kind: PermissionTargetKind.Anyone }, retrieving)],
    });
    expect(isOperationAllowed(actingAs(9), requireInventory(open), retrieving)).toBe(true);
    expect(isOperationAllowed(actingAs(null), requireInventory(locked), retrieving)).toBe(true);
  });

  it("matches targets: entity, faction, role, anyone", () => {
    const entity = createInventoryEntity(1, {
      rules: [
        rule(grant, { kind: PermissionTargetKind.Entity, entityId: 10 }, retrieving),
        rule(grant, { kind: PermissionTargetKind.Faction, factionId: 5 }, retrieving),
        rule(grant, { kind: PermissionTargetKind.Role, role: "trader" }, retrieving),
        rule(deny, { kind: PermissionTargetKind.Anyone }, retrieving),
      ],
    });
    const data = requireInventory(entity);
    expect(isOperationAllowed(actingAs(10), data, retrieving)).toBe(true);
    expect(isOperationAllowed(actingAs(20), data, retrieving)).toBe(true);
    expect(isOperationAllowed(actingAs(21), data, retrieving)).toBe(true);
    expect(isOperationAllowed(actingAs(30), data, retrieving)).toBe(false);
    expect(isOperationAllowed(actingAs(20, false), data, retrieving)).toBe(false);
  });

  // @covers 005:FR-025
  // @covers 005:FR-025a
  it("lets the first matching rule win, so order decides deny versus grant", () => {
    const denyFirst = createInventoryEntity(1, {
      rules: [
        rule(deny, { kind: PermissionTargetKind.Entity, entityId: 10 }, retrieving),
        rule(grant, { kind: PermissionTargetKind.Anyone }, retrieving),
      ],
    });
    const grantFirst = createInventoryEntity(2, {
      rules: [
        rule(grant, { kind: PermissionTargetKind.Entity, entityId: 10 }, retrieving),
        rule(deny, { kind: PermissionTargetKind.Anyone }, retrieving),
      ],
    });
    expect(isOperationAllowed(actingAs(10), requireInventory(denyFirst), retrieving)).toBe(false);
    expect(isOperationAllowed(actingAs(11), requireInventory(denyFirst), retrieving)).toBe(true);
    expect(isOperationAllowed(actingAs(10), requireInventory(grantFirst), retrieving)).toBe(true);
    expect(isOperationAllowed(actingAs(11), requireInventory(grantFirst), retrieving)).toBe(false);
  });

  it("only applies rules of the same operation; no match allows", () => {
    const entity = createInventoryEntity(1, {
      rules: [rule(deny, { kind: PermissionTargetKind.Anyone }, storing)],
    });
    const data = requireInventory(entity);
    expect(isOperationAllowed(actingAs(1), data, storing)).toBe(false);
    expect(isOperationAllowed(actingAs(1), data, retrieving)).toBe(true);
    expect(isOperationAllowed(actingAs(1), data, InventoryOperation.Equip)).toBe(true);
  });

  it("treats a Transfer rule as both storing and retrieving but not Equip", () => {
    const entity = createInventoryEntity(1, {
      rules: [rule(deny, { kind: PermissionTargetKind.Anyone }, InventoryOperation.Transfer)],
    });
    const data = requireInventory(entity);
    expect(isOperationAllowed(actingAs(1), data, storing)).toBe(false);
    expect(isOperationAllowed(actingAs(1), data, retrieving)).toBe(false);
    expect(isOperationAllowed(actingAs(1), data, InventoryOperation.Equip)).toBe(true);
  });
});

describe("assertOperationAllowed", () => {
  it("throws AccessDeniedError naming actor, entity and operation", () => {
    const entity = createInventoryEntity(4, {
      rules: [rule(deny, { kind: PermissionTargetKind.Anyone }, retrieving)],
    });
    const data = requireInventory(entity);
    expect(() => assertOperationAllowed(actingAs(9), entity, data, retrieving)).toThrow(
      AccessDeniedError,
    );
    expect(() => assertOperationAllowed(actingAs(9), entity, data, storing)).not.toThrow();
    expect(() => assertOperationAllowed(actingAs(null), entity, data, retrieving)).not.toThrow();
  });
});
