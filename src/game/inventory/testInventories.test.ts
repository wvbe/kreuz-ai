import { describe, expect, it } from "vitest";
import { createInventoryEntity, createTestContext, createTestMaterials } from "./testInventories";

describe("createTestMaterials", () => {
  it("registers the shared fixture materials with silver_penny as currency", () => {
    const materials = createTestMaterials();
    expect(materials.currencyId).toBe("silver_penny");
    expect(materials.require("cheese").perishabilityTicks).toBe(576);
    expect(materials.ids()).toContain("sword");
  });
});

describe("createInventoryEntity", () => {
  it("builds an entity with default or overridden inventory data", () => {
    expect(createInventoryEntity(1).components.Inventory).toMatchObject({ slotCount: 8 });
    expect(createInventoryEntity(2, { slotCount: 3 }).components.Inventory).toMatchObject({
      slotCount: 3,
    });
  });
});

describe("createTestContext", () => {
  it("records events once the bus queue is processed", () => {
    const { context, bus, events } = createTestContext();
    context.bus?.emit("inventory.item.stored", { entityId: 1 });
    expect(events).toHaveLength(0);
    bus.processQueue();
    expect(events).toHaveLength(1);
    expect(context.actor).toBeNull();
  });
});
