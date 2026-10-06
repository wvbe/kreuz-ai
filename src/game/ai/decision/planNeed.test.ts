import { describe, expect, it } from "vitest";
import { BlockReason } from "../../map/mapTypes";
import { getAiService } from "../aiServiceRegistry";
import { createAiWorld, removeItems } from "../testAiWorld";
import { planNeed } from "./planNeed";
import { NeedPlanKind } from "./needPlanTypes";

describe("planNeed", () => {
  it("prefers the own inventory for an item method", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 12);
    const plan = planNeed(world.engine, farmer, world.engine.content.needs.require("hunger"));
    expect(plan).toEqual({
      kind: NeedPlanKind.Consume,
      needId: "hunger",
      sourceId: farmer.id,
      materialId: "bread",
      mapId: world.mapId,
      cellIndex: 12,
      amountMilli: 30_000,
    });
  });

  it("returns null when nothing can satisfy the need", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    removeItems(world, farmer.id, "bread");
    const empty = world.engine.store.require(farmer.id);
    expect(planNeed(world.engine, empty, world.engine.content.needs.require("hunger"))).toBeNull();
    expect(planNeed(world.engine, empty, world.engine.content.needs.require("faith"))).toBeNull();
  });

  it("asks the registered need sources when the own inventory has nothing", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    removeItems(world, farmer.id, "bread");
    const store = world.spawn("baker", 6);
    const calls: string[] = [];
    getAiService(world.engine).registerNeedSource((engine, entity, need, method) => {
      calls.push(`${entity.id} ${need.id} ${method.ref}`);
      return {
        kind: NeedPlanKind.Consume,
        needId: need.id,
        sourceId: store.id,
        materialId: method.ref,
        mapId: world.mapId,
        cellIndex: 6,
        amountMilli: method.amount,
      };
    });
    const plan = planNeed(
      world.engine,
      world.engine.store.require(farmer.id),
      world.engine.content.needs.require("hunger"),
    );
    expect(calls).toEqual([`${farmer.id} hunger bread`]);
    expect(plan?.sourceId).toBe(store.id);
    expect(plan?.cellIndex).toBe(6);
  });

  it("falls back to sleeping on the ground at a reduced rate", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 33);
    const plan = planNeed(world.engine, farmer, world.engine.content.needs.require("rest"));
    expect(plan).toEqual({
      kind: NeedPlanKind.Sleep,
      needId: "rest",
      sourceId: null,
      materialId: null,
      mapId: world.mapId,
      cellIndex: 33,
      amountMilli: 600,
    });
  });

  it("prefers the nearest reachable bed (ties: lowest id) over the ground", () => {
    const world = createAiWorld();
    world.engine.prototypes.register({ id: "wooden_bed", components: { Position: {} } });
    const farmer = world.spawn("farmer", 0);
    const far = world.spawn("wooden_bed", 9);
    const near = world.spawn("wooden_bed", 2);
    const twin = world.spawn("wooden_bed", 20);
    const plan = planNeed(world.engine, farmer, world.engine.content.needs.require("rest"));
    expect(plan?.kind).toBe(NeedPlanKind.Sleep);
    expect(plan?.sourceId).toBe(near.id);
    expect(plan?.cellIndex).toBe(2);
    expect(plan?.amountMilli).toBe(1_200);
    expect([far.id, twin.id]).not.toContain(plan?.sourceId);
  });

  it("finds built beds: furniture pieces named by their furniture id", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    const piece = world.spawn("furniture_piece", 3, { Furniture: { furnitureId: "wooden_bed" } });
    const plan = planNeed(world.engine, farmer, world.engine.content.needs.require("rest"));
    expect(plan?.sourceId).toBe(piece.id);
  });

  it("prefers a better ranked bed over a nearer one and skips forbidden beds", () => {
    const world = createAiWorld();
    world.engine.prototypes.register({ id: "wooden_bed", components: { Position: {} } });
    const farmer = world.spawn("farmer", 0);
    const near = world.spawn("wooden_bed", 2);
    const far = world.spawn("wooden_bed", 9);
    const forbidden = world.spawn("wooden_bed", 1);
    getAiService(world.engine).setBedPolicy((_engine, _sleeper, bed) =>
      bed.id === forbidden.id ? null : bed.id === far.id ? 0 : 1,
    );
    const plan = planNeed(world.engine, farmer, world.engine.content.needs.require("rest"));
    expect(plan?.sourceId).toBe(far.id);
    expect([near.id, forbidden.id]).not.toContain(plan?.sourceId);
  });

  it("ignores beds that cannot be reached and beds on other maps", () => {
    const world = createAiWorld();
    world.engine.prototypes.register({ id: "wooden_bed", components: { Position: {} } });
    const farmer = world.spawn("farmer", 0);
    const map = world.engine.maps.require(world.mapId);
    world.spawn("wooden_bed", 5);
    map.setObstruction(5, BlockReason.Wall);
    const plan = planNeed(world.engine, farmer, world.engine.content.needs.require("rest"));
    expect(plan?.sourceId).toBeNull();
  });

  it("returns null for an entity without a Position", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    delete farmer.components["Position"];
    expect(planNeed(world.engine, farmer, world.engine.content.needs.require("hunger"))).toBeNull();
  });
});
