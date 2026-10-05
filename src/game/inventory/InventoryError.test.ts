import { describe, expect, it } from "vitest";
import {
  AccessDeniedError,
  DestinationFullError,
  EquipmentSlotIncompatibleError,
  InsufficientFundsError,
  InsufficientItemsError,
  InvalidQuantityError,
  InvalidTransferError,
  InventoryError,
  InventoryErrorKind,
  InventoryFullError,
  UnknownMaterialError,
  WeightLimitExceededError,
} from "./InventoryError";

describe("InventoryError", () => {
  it("carries a kind and message", () => {
    const error = new InventoryError(InventoryErrorKind.NoInventory, "nope");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe(InventoryErrorKind.NoInventory);
    expect(error.message).toBe("nope");
    expect(error.name).toBe("InventoryError");
  });
});

describe("spec error classes", () => {
  it("are InventoryErrors with the matching kind and name", () => {
    const cases: [InventoryError, InventoryErrorKind, string][] = [
      [new InventoryFullError("x"), InventoryErrorKind.InventoryFull, "InventoryFullError"],
      [new DestinationFullError("x"), InventoryErrorKind.DestinationFull, "DestinationFullError"],
      [
        new InsufficientItemsError("x"),
        InventoryErrorKind.InsufficientItems,
        "InsufficientItemsError",
      ],
      [
        new InsufficientFundsError("x"),
        InventoryErrorKind.InsufficientFunds,
        "InsufficientFundsError",
      ],
      [
        new WeightLimitExceededError("x"),
        InventoryErrorKind.WeightLimitExceeded,
        "WeightLimitExceededError",
      ],
      [
        new UnknownMaterialError("iron"),
        InventoryErrorKind.UnknownMaterial,
        "UnknownMaterialError",
      ],
      [new AccessDeniedError(1, 2, "store"), InventoryErrorKind.AccessDenied, "AccessDeniedError"],
      [
        new EquipmentSlotIncompatibleError("x"),
        InventoryErrorKind.EquipmentSlotIncompatible,
        "EquipmentSlotIncompatibleError",
      ],
      [new InvalidQuantityError(0), InventoryErrorKind.InvalidQuantity, "InvalidQuantityError"],
      [new InvalidTransferError("x"), InventoryErrorKind.InvalidTransfer, "InvalidTransferError"],
    ];
    for (const [error, kind, name] of cases) {
      expect(error).toBeInstanceOf(InventoryError);
      expect(error.kind).toBe(kind);
      expect(error.name).toBe(name);
    }
  });

  it("names the offending inputs", () => {
    expect(new UnknownMaterialError("iron").message).toContain("iron");
    const denied = new AccessDeniedError(7, 9, "retrieve");
    expect(denied.actor).toBe(7);
    expect(denied.entityId).toBe(9);
    expect(denied.message).toContain("retrieve");
    expect(new InvalidQuantityError(1.5).message).toContain("1.5");
  });
});
