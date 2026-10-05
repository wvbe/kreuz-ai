import type { Entity, EntityId } from "../ecs/Entity";
import { AccessDeniedError } from "./InventoryError";
import { InventoryOperation, PermissionTargetKind, PermissionType } from "./inventoryTypes";
import type {
  InventoryContext,
  InventoryData,
  PermissionRule,
  PermissionTarget,
} from "./inventoryTypes";

function targetMatches(
  context: InventoryContext,
  actor: EntityId,
  target: PermissionTarget,
): boolean {
  switch (target.kind) {
    case PermissionTargetKind.Anyone:
      return true;
    case PermissionTargetKind.Entity:
      return target.entityId === actor;
    case PermissionTargetKind.Faction:
      return context.resolver?.isInFaction(actor, target.factionId) === true;
    case PermissionTargetKind.Role:
      return context.resolver?.hasRole(actor, target.role) === true;
  }
}

function operationMatches(rule: PermissionRule, operation: InventoryOperation): boolean {
  return (
    rule.operation === operation ||
    (rule.operation === InventoryOperation.Transfer &&
      (operation === InventoryOperation.Store || operation === InventoryOperation.Retrieve))
  );
}

/**
 * Evaluates the permission rules of an inventory at call time (spec 005 FR-025a, DECISIONS
 * D-07): the first rule that matches the actor and the operation decides, no match allows, and
 * the system actor (`null`) always passes. A `Transfer` rule matches `Store` and `Retrieve`.
 *
 * @param context - Inventory context naming the actor and optional membership resolver.
 * @param data - Inventory data holding the rules.
 * @param operation - The operation being attempted.
 * @returns True when the actor may perform the operation.
 */
export function isOperationAllowed(
  context: InventoryContext,
  data: InventoryData,
  operation: InventoryOperation,
): boolean {
  const actor = context.actor;
  if (actor === null) {
    return true;
  }
  for (const rule of data.rules) {
    if (operationMatches(rule, operation) && targetMatches(context, actor, rule.target)) {
      return rule.type === PermissionType.Grant;
    }
  }
  return true;
}

/**
 * Throws {@link AccessDeniedError} when the context actor may not perform the operation.
 *
 * @param context - Inventory context naming the actor.
 * @param entity - Entity owning the inventory.
 * @param data - Its inventory data.
 * @param operation - The operation being attempted.
 */
export function assertOperationAllowed(
  context: InventoryContext,
  entity: Entity,
  data: InventoryData,
  operation: InventoryOperation,
): void {
  if (!isOperationAllowed(context, data, operation) && context.actor !== null) {
    throw new AccessDeniedError(context.actor, entity.id, operation);
  }
}
