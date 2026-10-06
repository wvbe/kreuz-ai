import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../engine/EventBus";
import { getTotal } from "../../inventory/inventoryQueries";
import { BlockReason } from "../../map/mapTypes";
import { AiTaskPriority, AiTaskType } from "../aiTypes";
import { NeedPlanKind } from "../decision/needPlanTypes";
import type { NeedPlan } from "../decision/needPlanTypes";
import { getNeedValue } from "../needs/needAccess";
import { createAiWorld, removeItems } from "../testAiWorld";
import type { AiTestWorld } from "../testAiWorld";
import { createSatisfyTask, satisfyTaskData, wakeCheckIntervalTicks } from "./satisfyTask";

const noAi = { AiState: { treeId: null } };

function setNeed(world: AiTestWorld, id: number, needId: string, value: number): void {
  const needs = world.engine.store.require(id).components["Needs"] as {
    values: { needId: string; valueMilli: number }[];
  };
  const slot = needs.values.find((entry) => entry.needId === needId);
  if (slot) slot.valueMilli = value;
}

function value(world: AiTestWorld, id: number, needId: string): number {
  return getNeedValue(world.engine.store.require(id), needId) ?? -1;
}

function eatPlan(world: AiTestWorld, sourceId: number, cellIndex: number): NeedPlan {
  return {
    kind: NeedPlanKind.Consume,
    needId: "hunger",
    sourceId,
    materialId: "bread",
    mapId: world.mapId,
    cellIndex,
    amountMilli: 30_000,
  };
}

function enqueue(world: AiTestWorld, id: number, plan: NeedPlan): void {
  world.engine.tasks.enqueue(id, {
    type: AiTaskType.Satisfy,
    data: satisfyTaskData(plan),
    priority: AiTaskPriority.Need,
  });
}

function lastOutcome(world: AiTestWorld, id: number): { outcome: string; reason: string | null } {
  const last = world.engine.tasks.getQueue(id)?.history.at(-1);
  return { outcome: last?.outcome ?? "none", reason: last?.reason ?? null };
}

// @covers 013:FR-002 013:FR-023
describe("satisfyTaskData", () => {
  it("wraps the plan as JSON", () => {
    const plan: NeedPlan = {
      kind: NeedPlanKind.Sleep,
      needId: "rest",
      sourceId: null,
      materialId: null,
      mapId: 1,
      cellIndex: 4,
      amountMilli: 600,
    };
    expect(satisfyTaskData(plan)).toEqual({ plan });
  });
});

describe("createSatisfyTask", () => {
  it("has the type ai.satisfy and needs Needs and Position", () => {
    const handler = createSatisfyTask(createAiWorld().engine);
    expect(handler.type).toBe("ai.satisfy");
    expect(handler.requires).toEqual(["Needs", "Position"]);
  });

  it("eats from the own inventory in one tick and emits need.item.consumed", () => {
    const world = createAiWorld();
    const settler = world.spawn("farmer", 0, noAi);
    setNeed(world, settler.id, "hunger", 10_000);
    const consumed: JsonValue[] = [];
    world.engine.bus.subscribe("need.item.consumed", (payload) => consumed.push(payload));
    enqueue(world, settler.id, eatPlan(world, settler.id, 0));
    world.run(1);
    // 10000 - 150 decay + 30000 bread
    expect(value(world, settler.id, "hunger")).toBe(39_850);
    expect(getTotal(world.engine.store.require(settler.id), "bread")).toBe(1);
    expect(consumed).toEqual([
      { entityId: settler.id, needId: "hunger", materialId: "bread", quantity: 1 },
    ]);
    expect(lastOutcome(world, settler.id).outcome).toBe("Completed");
  });

  it("walks to a source entity first and takes the item from its inventory", () => {
    const world = createAiWorld();
    const hungry = world.spawn("peasant", 0, noAi);
    const baker = world.spawn("baker", 3, noAi);
    world.engine.store.require(hungry.id).components["Inventory"] = {
      ...(hungry.components["Inventory"] as object),
      slots: [],
    };
    setNeed(world, hungry.id, "hunger", 5_000);
    enqueue(world, hungry.id, eatPlan(world, baker.id, 3));
    world.run(2);
    expect(value(world, hungry.id, "hunger")).toBeLessThan(5_000);
    world.run(5);
    expect(value(world, hungry.id, "hunger")).toBeGreaterThan(30_000);
    expect(getTotal(world.engine.store.require(baker.id), "bread")).toBe(1);
    expect((world.engine.store.require(hungry.id).components["Position"] as { cellIndex: number }).cellIndex).toBe(3);
    expect(lastOutcome(world, hungry.id).outcome).toBe("Completed");
  });

  it("fails with source_gone when the source does not hold the item any more", () => {
    const world = createAiWorld();
    const settler = world.spawn("farmer", 0, noAi);
    enqueue(world, settler.id, eatPlan(world, 9999, 0));
    world.run(1);
    expect(lastOutcome(world, settler.id)).toEqual({ outcome: "Failed", reason: "source_gone" });
    expect(getTotal(world.engine.store.require(settler.id), "bread")).toBe(2);
  });

  it("fails with source_gone when the holder has no such item", () => {
    const world = createAiWorld();
    const settler = world.spawn("farmer", 0, noAi);
    const board = world.engine.store.spawn("job_board");
    enqueue(world, settler.id, eatPlan(world, board.id, 0));
    world.run(1);
    expect(lastOutcome(world, settler.id)).toEqual({ outcome: "Failed", reason: "source_gone" });
  });

  it("fails with approach_failed when the walk to the source fails", () => {
    const world = createAiWorld();
    const settler = world.spawn("farmer", 0, noAi);
    world.engine.maps.require(world.mapId).setTerrain(5, "water_shallow");
    enqueue(world, settler.id, eatPlan(world, settler.id, 5));
    world.run(3);
    expect(lastOutcome(world, settler.id)).toEqual({
      outcome: "Failed",
      reason: "approach_failed",
    });
    expect(world.engine.maps.require(world.mapId).blockReason(5)).toBe(BlockReason.Water);
  });

  it("sleeps on the ground until the wake threshold, with a mood penalty", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 4, noAi);
    setNeed(world, settler.id, "rest", 10_000);
    enqueue(world, settler.id, {
      kind: NeedPlanKind.Sleep,
      needId: "rest",
      sourceId: null,
      materialId: null,
      mapId: world.mapId,
      cellIndex: 4,
      amountMilli: 600,
    });
    let ticks = 0;
    while (lastOutcome(world, settler.id).outcome === "none" && ticks < 400) {
      world.run(1);
      ticks += 1;
    }
    expect(lastOutcome(world, settler.id).outcome).toBe("Completed");
    // net 450 per tick (600 sleep - 150 decay): 80000 / 450 rounds up to 178 ticks
    expect(ticks).toBe(178);
    expect(value(world, settler.id, "rest")).toBeGreaterThanOrEqual(90_000);
    const mood = world.engine.store.require(settler.id).components["Mood"] as {
      influences: { source: string; deltaMilli: number }[];
    };
    expect(mood.influences.map((item) => item.source)).toContain("slept_on_ground");
  });

  describe("waking a sleeper for another critical need (DECISIONS D-180)", () => {
    const groundSleep = (world: AiTestWorld, id: number): void =>
      enqueue(world, id, {
        kind: NeedPlanKind.Sleep,
        needId: "rest",
        sourceId: null,
        materialId: null,
        mapId: world.mapId,
        cellIndex: 4,
        amountMilli: 600,
      });

    it("wakes when hunger is critical and food is at hand: the sleep ends early", () => {
      const world = createAiWorld();
      const settler = world.spawn("peasant", 4, noAi);
      setNeed(world, settler.id, "rest", 10_000);
      setNeed(world, settler.id, "hunger", 10_000);
      groundSleep(world, settler.id);
      world.run(wakeCheckIntervalTicks + 1);
      expect(lastOutcome(world, settler.id).outcome).toBe("Completed");
      expect(value(world, settler.id, "rest")).toBeLessThan(90_000);
    });

    it("keeps sleeping when hunger is critical but nothing can be eaten", () => {
      const world = createAiWorld();
      const settler = world.spawn("peasant", 4, noAi);
      removeItems(world, settler.id, "bread");
      setNeed(world, settler.id, "rest", 10_000);
      setNeed(world, settler.id, "hunger", 10_000);
      groundSleep(world, settler.id);
      world.run(20);
      expect(lastOutcome(world, settler.id).outcome).toBe("none");
    });

    it("does not wake a settler who has collapsed (rest exactly zero)", () => {
      const world = createAiWorld();
      const settler = world.spawn("peasant", 4, noAi);
      setNeed(world, settler.id, "rest", 0);
      setNeed(world, settler.id, "hunger", 10_000);
      world.engine.tasks.enqueue(settler.id, {
        type: AiTaskType.Satisfy,
        data: satisfyTaskData({
          kind: NeedPlanKind.Sleep,
          needId: "rest",
          sourceId: null,
          materialId: null,
          mapId: world.mapId,
          cellIndex: 4,
          amountMilli: 600,
        }),
        priority: AiTaskPriority.Collapse,
      });
      world.run(wakeCheckIntervalTicks + 1);
      expect(lastOutcome(world, settler.id).outcome).toBe("none");
    });

    it("keeps sleeping when hunger is not critical", () => {
      const world = createAiWorld();
      const settler = world.spawn("peasant", 4, noAi);
      setNeed(world, settler.id, "rest", 10_000);
      groundSleep(world, settler.id);
      world.run(20);
      expect(lastOutcome(world, settler.id).outcome).toBe("none");
    });
  });

  it("sleeps faster in a bed and without the mood penalty", () => {
    const world = createAiWorld();
    world.engine.prototypes.register({ id: "wooden_bed", components: { Position: {} } });
    const bed = world.spawn("wooden_bed", 2);
    const settler = world.spawn("peasant", 0, noAi);
    setNeed(world, settler.id, "rest", 10_000);
    enqueue(world, settler.id, {
      kind: NeedPlanKind.Sleep,
      needId: "rest",
      sourceId: bed.id,
      materialId: null,
      mapId: world.mapId,
      cellIndex: 2,
      amountMilli: 1_200,
    });
    let ticks = 0;
    while (lastOutcome(world, settler.id).outcome === "none" && ticks < 400) {
      world.run(1);
      ticks += 1;
    }
    expect(lastOutcome(world, settler.id).outcome).toBe("Completed");
    expect(ticks).toBeLessThan(100);
    expect((world.engine.store.require(settler.id).components["Position"] as { cellIndex: number }).cellIndex).toBe(2);
    const mood = world.engine.store.require(settler.id).components["Mood"] as {
      influences: { source: string }[];
    };
    expect(mood.influences.map((item) => item.source)).not.toContain("slept_on_ground");
  });
});
