import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../game/engine/EventBus";
import { formatStandingOrder, formatStandingOrders, formatSteward } from "./formatStanding";

const summary = {
  orderId: 1,
  materialId: "bread",
  recipeId: "bake_bread",
  targetQuantity: 20,
  restockThreshold: 15,
  scope: "settlement",
  zoneId: null,
  priority: 50,
  postingBoardId: null,
  state: "Restocking",
  outputPerRun: 2,
  countedStock: 12,
  pendingAdd: 2,
  open: 1,
  claimed: 1,
  blocked: null,
};
const blocked = {
  ...summary,
  orderId: 2,
  materialId: "flour",
  scope: "zone",
  zoneId: 9,
  state: "Blocked",
  blocked: { kind: "MissingInput", params: { materialId: "wheat", required: 2 } },
};
const detail: JsonValue = {
  ...blocked,
  reasons: [
    { kind: "MissingInput", params: { materialId: "wheat", required: 2 } },
    { kind: "AwaitingTownCrier", params: {} },
  ],
  resolvedBoardId: 4,
  postingBoardId: 4,
  runs: [
    { runId: 1, status: "PendingAdd", boardId: 4, updateId: 7, productionOrderId: null },
    { runId: 2, status: "Open", boardId: 4, updateId: null, productionOrderId: 11 },
  ],
};

describe("formatStandingOrders", () => {
  it("shows one line per order with state, stock, scope, runs and the primary reason", () => {
    expect(formatStandingOrders([summary, blocked])).toEqual([
      "#1 bread: Restocking, stock 12/20 (restock at 15), settlement, priority 50, runs 2 on the way, 1 open, 1 claimed",
      "#2 flour: Blocked, stock 12/20 (restock at 15), zone #9, priority 50, runs 2 on the way, 1 open, 1 claimed - MissingInput (materialId wheat, required 2)",
    ]);
  });

  it("says so when there are no orders and ignores foreign views", () => {
    expect(formatStandingOrders([])).toEqual([
      "no standing orders (standing create <materialId> <target>)",
    ]);
    expect(formatStandingOrders({ nope: 1 })).toEqual([]);
  });
});

describe("formatStandingOrder", () => {
  it("adds the recipe, the board, every reason and each run", () => {
    const lines = formatStandingOrder(detail);
    expect(lines[1]).toBe(
      "recipe bake_bread (2 per run), runs go to board #4 (chosen by the order)",
    );
    expect(lines[2]).toBe("why: MissingInput (materialId wheat, required 2); AwaitingTownCrier");
    expect(lines.slice(3)).toEqual([
      "  run #1 PendingAdd: update #7 on board #4",
      "  run #2 Open: production order #11",
    ]);
  });

  it("names a missing board and has no why line without reasons", () => {
    const lines = formatStandingOrder({
      ...detail,
      reasons: [],
      resolvedBoardId: null,
      postingBoardId: null,
      runs: [],
    });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("none reachable");
    expect(formatStandingOrder({ nope: 1 })).toEqual([]);
  });
});

describe("formatSteward", () => {
  it("shows the office, the throne room, the reviews and the notice posts", () => {
    expect(
      formatSteward({
        stewardEntityId: 8,
        stewardBoardId: 2,
        seatZoneId: 5,
        lastReviewTick: 72,
        nextReviewTick: 360,
        extraReviewRequested: true,
        orders: 2,
        noticePosts: [31, 40],
      }),
    ).toEqual([
      "steward: #8, throne room #5, own board #2",
      "reviews: last tick 72, next daily at tick 360, one extra requested; 2 order(s); notice posts #31, #40",
    ]);
  });

  it("shows an empty office", () => {
    const lines = formatSteward({
      stewardEntityId: null,
      stewardBoardId: null,
      seatZoneId: null,
      lastReviewTick: null,
      nextReviewTick: 72,
      extraReviewRequested: false,
      orders: 0,
      noticePosts: [],
    });
    expect(lines[0]).toBe(
      "steward: nobody (steward appoint <entityId>), throne room none, own board none",
    );
    expect(lines[1]).toBe(
      "reviews: last never, next daily at tick 72; 0 order(s); notice posts none",
    );
    expect(formatSteward("x")).toEqual([]);
  });
});
