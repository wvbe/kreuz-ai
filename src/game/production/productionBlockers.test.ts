import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { skillsComponent } from "../skills/skillsComponent";
import { ProductionError } from "./ProductionError";
import {
  availableForCraft,
  explainOrder,
  explainWorkstation,
  hasQualifiedWorker,
  inputProducer,
  orderBlockers,
} from "./productionBlockers";
import { CauseSubjectKind, OrderStatus, ProductionBlockedKind } from "./productionTypes";
import { contentWithRecipes, createProductionWorld } from "./testProductionWorld";

const kinds = (reasons: { kind: ProductionBlockedKind }[]): ProductionBlockedKind[] =>
  reasons.map((reason) => reason.kind);

describe("availableForCraft", () => {
  it("adds the unreserved work inventory to the unreserved storage stock", () => {
    const world = createProductionWorld();
    const chest = world.chest(50);
    const sawmill = world.station("sawmill", 22);
    world.give(chest, "oak_log", 5);
    world.give(sawmill, "oak_log", 2);
    expect(availableForCraft(world.engine, sawmill, "oak_log")).toBe(7);
    expect(availableForCraft(world.engine, sawmill, "wheat")).toBe(0);
  });
});

describe("hasQualifiedWorker", () => {
  it("needs a citizen, and one with the level when the recipe asks for it", () => {
    const world = createProductionWorld({
      content: contentWithRecipes([
        {
          id: "fine_planks",
          name: "Fine planks",
          inputs: [{ materialId: "oak_log", quantity: 1 }],
          outputs: [{ materialId: "oak_plank", quantity: 3 }],
          durationTicks: 10,
          workstationTag: "sawmill",
          skillId: "carpentry",
          minSkillLevel: 20,
        },
      ]),
    });
    const plain = world.engine.content.recipes.require("saw_oak_planks");
    const fine = world.engine.content.recipes.require("fine_planks");
    expect(hasQualifiedWorker(world.engine, plain)).toBe(false);
    const settler = world.settler(11);
    expect(hasQualifiedWorker(world.engine, plain)).toBe(true);
    expect(hasQualifiedWorker(world.engine, fine)).toBe(false);
    const skills = getComponent(settler, skillsComponent);
    if (skills !== undefined) {
      skills.values["carpentry"] = 20_000;
    }
    expect(hasQualifiedWorker(world.engine, fine)).toBe(true);
  });
});

describe("inputProducer", () => {
  it("reports noProducer, a stalled producer, or no cause when a producer is served", () => {
    const world = createProductionWorld();
    const mill = world.station("grinding_mill", 22);
    const oven = world.station("oven", 33);
    const bake = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    expect(inputProducer(world.engine, "flour", bake)).toEqual({
      noProducer: true,
      causeRef: null,
    });
    world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 1 });
    expect(inputProducer(world.engine, "flour", bake)).toEqual({
      noProducer: false,
      causeRef: { kind: CauseSubjectKind.Workstation, entityId: mill.id },
    });
    const order = world.data(mill).orders[0];
    if (order !== undefined) {
      order.postingId = 5;
    }
    expect(inputProducer(world.engine, "flour", bake)).toEqual({
      noProducer: false,
      causeRef: null,
    });
  });

  it("counts an open gathering posting as a producer", () => {
    const world = createProductionWorld();
    const oven = world.station("oven", 33);
    const order = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    expect(inputProducer(world.engine, "oak_log", order).noProducer).toBe(true);
    world.postFell(4);
    expect(inputProducer(world.engine, "oak_log", order)).toEqual({
      noProducer: false,
      causeRef: null,
    });
  });
});

describe("orderBlockers and explainOrder", () => {
  it("reports MissingInput per recipe input with the available count", () => {
    const world = createProductionWorld();
    world.settler(11);
    const mill = world.station("grinding_mill", 22);
    const chest = world.chest(50);
    world.give(chest, "wheat", 1);
    const order = world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 1 });
    const explanation = explainOrder(world.engine, order);
    expect(explanation).toMatchObject({ orderId: order, workstationId: mill.id });
    expect(explanation.reasons).toEqual([
      {
        kind: ProductionBlockedKind.MissingInput,
        params: { materialId: "wheat", required: 2, available: 1, noProducer: true },
        causeRef: null,
      },
    ]);
    world.give(chest, "wheat", 1);
    expect(explainOrder(world.engine, order).reasons).toEqual([]);
  });

  it("reports MissingWorkstation when the workstation cannot make the recipe", () => {
    const world = createProductionWorld();
    world.settler(11);
    const sawmill = world.station("sawmill", 22);
    const order = world.order({
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 1,
    });
    const stored = world.data(sawmill).orders[0];
    if (stored !== undefined) {
      stored.recipeId = "bake_bread";
    }
    const reasons = explainOrder(world.engine, order).reasons;
    expect(reasons[0]).toEqual({
      kind: ProductionBlockedKind.MissingWorkstation,
      params: { workstationTag: "oven" },
      causeRef: null,
    });
  });

  it("reports MissingRoom until the workstation stands in an active zone of the type", () => {
    const world = createProductionWorld();
    world.settler(11);
    const cells = world.rect(2, 2, 2, 2);
    const oven = world.station("oven", cells[0] ?? 0);
    const chest = world.chest(90);
    world.give(chest, "flour", 1);
    const order = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    expect(explainOrder(world.engine, order).reasons).toEqual([
      { kind: ProductionBlockedKind.MissingRoom, params: { zoneTypeId: "bakery" }, causeRef: null },
    ]);
    const [zoneId] = world.designate("bakery", cells);
    world.run(2);
    expect(explainOrder(world.engine, order).reasons).toEqual([
      {
        kind: ProductionBlockedKind.MissingRoom,
        params: { zoneTypeId: "bakery" },
        causeRef: { kind: CauseSubjectKind.Zone, entityId: zoneId ?? 0 },
      },
    ]);
    world.walls(2, 2, 2, 2);
    world.run(3);
    expect(explainOrder(world.engine, order).reasons).toEqual([]);
  });

  it("reports NoQualifiedWorker, MissingTool and OutputBlocked", () => {
    const world = createProductionWorld({
      content: contentWithRecipes([
        {
          id: "forge_planks",
          name: "Forge planks",
          inputs: [{ materialId: "oak_log", quantity: 1 }],
          outputs: [{ materialId: "oak_plank", quantity: 2 }],
          durationTicks: 10,
          workstationTag: "sawmill",
          skillId: "carpentry",
          toolMaterialIds: ["iron_hammer"],
          minSkillLevel: 30,
        },
      ]),
    });
    const sawmill = world.station("sawmill", 22);
    const chest = world.chest(50);
    world.give(chest, "oak_log", 3);
    const order = world.order({ workstationId: sawmill.id, recipeId: "forge_planks", quantity: 1 });
    expect(kinds(explainOrder(world.engine, order).reasons)).toEqual([
      ProductionBlockedKind.NoQualifiedWorker,
      ProductionBlockedKind.MissingTool,
    ]);
    expect(explainOrder(world.engine, order).reasons).toEqual([
      {
        kind: ProductionBlockedKind.NoQualifiedWorker,
        params: { skillId: "carpentry", requiredLevel: 30 },
        causeRef: null,
      },
      { kind: ProductionBlockedKind.MissingTool, params: { tag: "iron_hammer" }, causeRef: null },
    ]);
    world.give(chest, "iron_hammer", 1);
    const inventory = sawmill.components["Inventory"] as { slotCount: number };
    inventory.slotCount = 1;
    world.give(sawmill, "wheat", 1);
    const stored = world.data(sawmill).orders[0] ?? fail();
    const blocked = orderBlockers(world.engine, sawmill, stored);
    expect(kinds(blocked)).toContain(ProductionBlockedKind.OutputBlocked);
    expect(blocked.at(-1)).toEqual({
      kind: ProductionBlockedKind.OutputBlocked,
      params: { materialId: "oak_plank" },
      causeRef: null,
    });
  });

  it("reports LockedByTier for an order whose recipe is locked, Paused for a paused order", () => {
    const world = createProductionWorld();
    world.settler(11);
    const oven = world.station("oven", 22);
    const order = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    world.setTier("hamlet");
    expect(explainOrder(world.engine, order).reasons[0]).toEqual({
      kind: ProductionBlockedKind.LockedByTier,
      params: { contentKind: "recipe", contentId: "bake_bread", requiredTier: "village" },
      causeRef: null,
    });
    world.command("SetProductionOrderPaused", { orderId: order, paused: true });
    expect(explainOrder(world.engine, order)).toMatchObject({
      status: OrderStatus.Paused,
      reasons: [
        {
          kind: ProductionBlockedKind.Paused,
          params: { productionOrderId: order },
          causeRef: null,
        },
      ],
    });
    world.command("CancelProductionOrder", { orderId: order });
    expect(explainOrder(world.engine, order)).toMatchObject({
      status: OrderStatus.Cancelled,
      reasons: [],
    });
  });

  it("falls back to MissingWorkstation for an order whose recipe vanished", () => {
    const world = createProductionWorld();
    const oven = world.station("oven", 22);
    const order = world.order({ workstationId: oven.id, recipeId: "bake_bread", quantity: 1 });
    const stored = world.data(oven).orders[0];
    if (stored !== undefined) {
      stored.recipeId = "gone";
    }
    expect(kinds(explainOrder(world.engine, order).reasons)).toEqual([
      ProductionBlockedKind.MissingWorkstation,
    ]);
  });

  it("throws for an unknown order", () => {
    const world = createProductionWorld();
    expect(() => explainOrder(world.engine, 77)).toThrow(ProductionError);
  });
});

describe("explainWorkstation", () => {
  it("is Idle (NoOrders) without active orders, then explains the first order, then is quiet", () => {
    const world = createProductionWorld();
    world.settler(11);
    const mill = world.station("grinding_mill", 22);
    expect(kinds(explainWorkstation(world.engine, mill.id))).toEqual([
      ProductionBlockedKind.NoOrders,
    ]);
    const order = world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 1 });
    expect(kinds(explainWorkstation(world.engine, mill.id))).toEqual([
      ProductionBlockedKind.MissingInput,
    ]);
    const stored = world.data(mill).orders[0];
    if (stored !== undefined) {
      stored.postingId = 3;
    }
    expect(explainWorkstation(world.engine, mill.id)).toEqual([]);
    world.command("CancelProductionOrder", { orderId: order });
    expect(kinds(explainWorkstation(world.engine, mill.id))).toEqual([
      ProductionBlockedKind.NoOrders,
    ]);
    expect(() => explainWorkstation(world.engine, 9999)).toThrow(ProductionError);
  });
});

function fail(): never {
  throw new Error("expected an order");
}
