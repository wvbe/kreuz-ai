import { describe, it, expect } from "vitest";
import { createEntityManager, createEntity, addComponent } from "../engine/EntityManager";
import { addItem, removeItem, transferItem, getItemQuantity, hasEnough, createInventory } from "./InventorySystem";

describe("InventorySystem", () => {
  function setupEntity(capacity: number) {
    const manager = createEntityManager();
    const entity = createEntity(manager);
    addComponent(manager, entity, "inventory", createInventory(capacity));
    return { manager, entity };
  }

  it("adds items to inventory", () => {
    const { manager, entity } = setupEntity(100);
    const added = addItem(manager, entity, "wood", 10);
    expect(added).toBe(10);
    expect(getItemQuantity(manager, entity, "wood")).toBe(10);
  });

  it("stacks same material", () => {
    const { manager, entity } = setupEntity(100);
    addItem(manager, entity, "wood", 5);
    addItem(manager, entity, "wood", 3);
    expect(getItemQuantity(manager, entity, "wood")).toBe(8);
  });

  it("respects capacity", () => {
    const { manager, entity } = setupEntity(10);
    const added = addItem(manager, entity, "stone", 15);
    expect(added).toBe(10);
    expect(getItemQuantity(manager, entity, "stone")).toBe(10);
  });

  it("removes items from inventory", () => {
    const { manager, entity } = setupEntity(100);
    addItem(manager, entity, "wood", 10);
    const removed = removeItem(manager, entity, "wood", 3);
    expect(removed).toBe(3);
    expect(getItemQuantity(manager, entity, "wood")).toBe(7);
  });

  it("transfers between entities", () => {
    const manager = createEntityManager();
    const from = createEntity(manager);
    const to = createEntity(manager);
    addComponent(manager, from, "inventory", createInventory(100));
    addComponent(manager, to, "inventory", createInventory(100));
    addItem(manager, from, "iron", 5);

    const transferred = transferItem(manager, from, to, "iron", 3);
    expect(transferred).toBe(3);
    expect(getItemQuantity(manager, from, "iron")).toBe(2);
    expect(getItemQuantity(manager, to, "iron")).toBe(3);
  });

  it("hasEnough checks correctly", () => {
    const { manager, entity } = setupEntity(100);
    addItem(manager, entity, "gold", 5);
    expect(hasEnough(manager, entity, "gold", 3)).toBe(true);
    expect(hasEnough(manager, entity, "gold", 10)).toBe(false);
  });
});
