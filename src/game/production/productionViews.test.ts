import { describe, expect, it } from "vitest";
import {
  buildOrderDetail,
  buildOrderViews,
  buildRecipeViews,
  buildWorkstationViews,
} from "./productionViews";
import { OrderStatus, ProductionBlockedKind } from "./productionTypes";
import { createProductionWorld } from "./testProductionWorld";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";

describe("buildOrderViews", () => {
  it("lists the orders of all or one workstation, ascending", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    const mill = world.station("grinding_mill", 22);
    const sawmill = world.station("sawmill", 23);
    const first = world.order({
      workstationId: sawmill.id,
      recipeId: "saw_oak_planks",
      quantity: 2,
    });
    const second = world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 1 });
    expect(buildOrderViews(world.engine).map((view) => view.orderId)).toEqual([second, first]);
    expect(buildOrderViews(world.engine, sawmill.id)).toEqual([
      {
        orderId: first,
        workstationId: sawmill.id,
        recipeId: "saw_oak_planks",
        quantity: 2,
        remaining: 2,
        priority: 50,
        status: OrderStatus.Active,
        postingId: null,
        createdTick: 0,
        crafting: null,
      },
    ]);
    expect(buildOrderViews(world.engine, 9999)).toEqual([]);
  });

  it("shows the craft in progress with integer progress", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    world.give(world.chest(55), "oak_log", 2);
    const sawmill = world.station("sawmill", 44);
    world.feed([world.settler(11)]);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    for (let tick = 0; tick < 200 && world.data(sawmill).craft === null; tick += 1) {
      world.run(1);
    }
    world.run(7);
    const [view] = buildOrderViews(world.engine, sawmill.id);
    expect(view?.crafting).toMatchObject({ progressTicks: 7, durationTicks: 24 });
    const [station] = buildWorkstationViews(world.engine);
    expect(station?.crafting).toMatchObject({ recipeId: "saw_oak_planks", progressTicks: 7 });
    expect(station?.blocked).toEqual([]);
  });
});

describe("buildOrderDetail", () => {
  it("adds the blocked reasons, null for an unknown order", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    world.settler(11);
    const mill = world.station("grinding_mill", 22);
    const id = world.order({ workstationId: mill.id, recipeId: "grind_flour", quantity: 1 });
    const detail = buildOrderDetail(world.engine, id);
    expect(detail?.blocked.map((reason) => reason.kind)).toEqual([
      ProductionBlockedKind.MissingInput,
    ]);
    expect(buildOrderDetail(world.engine, 99)).toBeNull();
  });
});

describe("buildRecipeViews", () => {
  it("lists the recipes a workstation can make with their lock state", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    const oven = world.station("oven", 22);
    world.setTier("hamlet");
    expect(
      buildRecipeViews(world.engine, oven.id)?.filter((view) => view.id === "bake_bread"),
    ).toEqual([
      {
        id: "bake_bread",
        name: "Bake bread",
        inputs: [{ materialId: "flour", quantity: 1 }],
        outputs: [{ materialId: "bread", quantity: 2 }],
        durationTicks: 20,
        skillId: "baking",
        minSkillLevel: 0,
        roomZoneId: "bakery",
        toolMaterialIds: [],
        unlockTier: "village",
        locked: true,
      },
    ]);
    world.setTier("village");
    expect(
      buildRecipeViews(world.engine, oven.id)?.find((view) => view.id === "bake_bread")?.locked,
    ).toBe(false);
    expect(buildRecipeViews(world.engine, world.chest(50).id)).toBeNull();
  });
});

describe("buildWorkstationViews", () => {
  it("lists workstations with tags, position, unfinished orders and why they idle", () => {
    const world = createProductionWorld({ content: loadVillageBakeryContent() });
    const sawmill = world.station("sawmill", 23);
    expect(buildWorkstationViews(world.engine)).toEqual([
      {
        entityId: sawmill.id,
        furnitureId: "sawmill",
        tags: ["sawmill", "workstation"],
        mapId: world.mapId,
        cellIndex: 23,
        crafting: null,
        unfinishedOrders: 0,
        blocked: [{ kind: ProductionBlockedKind.NoOrders, params: {}, causeRef: null }],
      },
    ]);
    world.order({ workstationId: sawmill.id, recipeId: "saw_oak_planks", quantity: 1 });
    expect(buildWorkstationViews(world.engine)[0]?.unfinishedOrders).toBe(1);
  });
});
