import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { StandingService } from "./StandingService";
import { StandingOrderScope } from "./standingTypes";
import type { StandingOrder } from "./standingTypes";

function order(orderId: number, overrides: Partial<StandingOrder> = {}): StandingOrder {
  return {
    orderId,
    materialId: "bread",
    recipeId: "bake_bread",
    targetQuantity: 20,
    restockThreshold: 15,
    scope: StandingOrderScope.Settlement,
    zoneId: null,
    priority: 50,
    postingBoardId: null,
    paused: false,
    restocking: true,
    outputPerRun: 2,
    deleted: false,
    createdTick: 3,
    ...overrides,
  };
}

function filled(): StandingService {
  const service = new StandingService();
  service.state.orders = [order(1), order(2, { materialId: "flour", recipeId: "grind_flour" })];
  service.state.nextOrderId = 3;
  service.state.runs = [
    { runId: 1, orderId: 1, boardId: 9, updateId: 4, productionOrderId: null },
    { runId: 2, orderId: 2, boardId: 9, updateId: null, productionOrderId: 7 },
    { runId: 3, orderId: 1, boardId: 9, updateId: null, productionOrderId: 8 },
  ];
  service.state.nextRunId = 4;
  service.state.stewardEntityId = 12;
  service.state.stewardBoardId = 9;
  service.state.extraReviewAfterTick = 40;
  service.state.lastReviewTick = 72;
  return service;
}

describe("StandingService", () => {
  it("starts empty and forgets everything on reset", () => {
    const service = filled();
    service.reset();
    expect(service.state).toEqual({
      nextOrderId: 1,
      nextRunId: 1,
      orders: [],
      runs: [],
      stewardEntityId: null,
      stewardBoardId: null,
      extraReviewAfterTick: null,
      lastReviewTick: null,
    });
  });

  it("finds an order and lists the runs of one order ascending", () => {
    const service = filled();
    expect(service.find(2)?.materialId).toBe("flour");
    expect(service.find(9)).toBeUndefined();
    expect(service.runsOf(1).map((run) => run.runId)).toEqual([1, 3]);
    expect(service.runsOf(5)).toEqual([]);
  });

  // @covers 026:FR-026
  it("round-trips through the root section `stewardship`", () => {
    const service = filled();
    const section = service.createSection();
    expect(section.key).toBe("stewardship");
    const saved = section.serialize();
    const restored = new StandingService();
    restored.createSection().restore(saved);
    expect(restored.createSection().serialize()).toEqual(saved);
    expect(restored.state.stewardEntityId).toBe(12);
    expect(section.defaultForOlderSaves?.()).toEqual(new StandingService().state);
  });

  it("rejects ids at or above the counters, a zone scope without a zone and orphan runs", () => {
    const schema = new StandingService().createSection().schema;
    const base = filled().createSection().serialize() as { [key: string]: JsonValue };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, nextOrderId: 2 }).success).toBe(false);
    expect(schema.safeParse({ ...base, nextRunId: 3 }).success).toBe(false);
    const zoneless = filled();
    zoneless.state.orders[0] = order(1, { scope: StandingOrderScope.Zone });
    expect(schema.safeParse(zoneless.createSection().serialize()).success).toBe(false);
    const orphan = filled();
    orphan.state.runs[0] = {
      runId: 1,
      orderId: 9,
      boardId: 9,
      updateId: null,
      productionOrderId: 1,
    };
    expect(schema.safeParse(orphan.createSection().serialize()).success).toBe(false);
    expect(schema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
