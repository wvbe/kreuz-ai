import type { EntityId } from "../ecs/Entity";

/**
 * Categories of inventory failure; callers branch on these instead of parsing messages.
 */
export enum InventoryErrorKind {
  InventoryFull = "inventory-full",
  DestinationFull = "destination-full",
  InsufficientItems = "insufficient-items",
  InsufficientFunds = "insufficient-funds",
  WeightLimitExceeded = "weight-limit-exceeded",
  UnknownMaterial = "unknown-material",
  AccessDenied = "access-denied",
  EquipmentSlotIncompatible = "equipment-slot-incompatible",
  InvalidQuantity = "invalid-quantity",
  InvalidTransfer = "invalid-transfer",
  NoInventory = "no-inventory",
  UnknownEquipmentSlot = "unknown-equipment-slot",
  EmptyEquipmentSlot = "empty-equipment-slot",
  InvalidDefinition = "invalid-definition",
  InvalidState = "invalid-state",
}

/**
 * Base class of every inventory failure. Failed operations leave all inventories unchanged
 * (spec 005 SC-003). The spec error names are subclasses so `instanceof` works too.
 */
export class InventoryError extends Error {
  /**
   * Creates an inventory error.
   *
   * @param kind - Failure category.
   * @param message - Human readable description naming the offending input.
   */
  constructor(
    public readonly kind: InventoryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

/**
 * The material does not fit into the free slots (spec 005 `InventoryFullError`).
 */
export class InventoryFullError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param message - Description including requested and fittable quantity.
   */
  constructor(message: string) {
    super(InventoryErrorKind.InventoryFull, message);
    this.name = "InventoryFullError";
  }
}

/**
 * A transfer target has no room for the material (spec 005 `DestinationFullError`).
 */
export class DestinationFullError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param message - Description including requested and fittable quantity.
   */
  constructor(message: string) {
    super(InventoryErrorKind.DestinationFull, message);
    this.name = "DestinationFullError";
  }
}

/**
 * Fewer items are held than requested (spec 005 `InsufficientItemsError`).
 */
export class InsufficientItemsError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param message - Description including requested and held quantity.
   */
  constructor(message: string) {
    super(InventoryErrorKind.InsufficientItems, message);
    this.name = "InsufficientItemsError";
  }
}

/**
 * The balance is lower than the debit (spec 005 `InsufficientFundsError`).
 */
export class InsufficientFundsError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param message - Description including balance and amount.
   */
  constructor(message: string) {
    super(InventoryErrorKind.InsufficientFunds, message);
    this.name = "InsufficientFundsError";
  }
}

/**
 * The store would exceed the inventory weight limit (spec 005 `WeightLimitExceededError`).
 */
export class WeightLimitExceededError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param message - Description including requested and fittable quantity.
   */
  constructor(message: string) {
    super(InventoryErrorKind.WeightLimitExceeded, message);
    this.name = "WeightLimitExceededError";
  }
}

/**
 * The material id is not in the material registry (spec 005 `UnknownMaterialError`).
 */
export class UnknownMaterialError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param materialId - The unregistered id.
   */
  constructor(materialId: string) {
    super(InventoryErrorKind.UnknownMaterial, `unknown material "${materialId}"`);
    this.name = "UnknownMaterialError";
  }
}

/**
 * A permission rule denied the actor (spec 005 `AccessDeniedError`).
 */
export class AccessDeniedError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param actor - The denied actor.
   * @param entityId - Entity whose inventory was accessed.
   * @param operation - Operation name that was denied.
   */
  constructor(
    public readonly actor: EntityId,
    public readonly entityId: EntityId,
    operation: string,
  ) {
    super(
      InventoryErrorKind.AccessDenied,
      `entity ${actor} may not ${operation} on the inventory of entity ${entityId}`,
    );
    this.name = "AccessDeniedError";
  }
}

/**
 * The item does not match the equipment slot restriction (spec 005
 * `EquipmentSlotIncompatibleError`).
 */
export class EquipmentSlotIncompatibleError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param message - Description naming the material and slot.
   */
  constructor(message: string) {
    super(InventoryErrorKind.EquipmentSlotIncompatible, message);
    this.name = "EquipmentSlotIncompatibleError";
  }
}

/**
 * A quantity or amount is not a positive safe integer.
 */
export class InvalidQuantityError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param value - The offending value.
   */
  constructor(value: number) {
    super(
      InventoryErrorKind.InvalidQuantity,
      `quantity must be a positive safe integer, got ${String(value)}`,
    );
    this.name = "InvalidQuantityError";
  }
}

/**
 * A transfer from an inventory to itself (DECISIONS D-07).
 */
export class InvalidTransferError extends InventoryError {
  /**
   * Creates the error.
   *
   * @param message - Description naming the entities.
   */
  constructor(message: string) {
    super(InventoryErrorKind.InvalidTransfer, message);
    this.name = "InvalidTransferError";
  }
}
