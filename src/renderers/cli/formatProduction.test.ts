import { describe, expect, it } from "vitest";
import {
  describeReason,
  firstBlockedReason,
  formatOrderDetail,
  formatOrderList,
} from "./formatProduction";

const order = {
  orderId: 3,
  workstationId: 17,
  recipeId: "bake_bread",
  quantity: 4,
  remaining: 3,
  priority: 50,
  status: "active",
  postingId: 9,
  createdTick: 2,
  crafting: null,
};

const reason = {
  kind: "MissingInput",
  params: { materialId: "flour", required: 1, available: 0, noProducer: true },
  causeRef: { kind: "workstation", entityId: 18 },
};

describe("describeReason", () => {
  it("prints the kind, the params and the cause", () => {
    expect(describeReason(reason)).toBe(
      "MissingInput materialId=flour required=1 available=0 noProducer=true cause=workstation#18",
    );
    expect(describeReason({ kind: "NoOrders", params: {}, causeRef: null })).toBe("NoOrders");
  });
});

describe("formatOrderList", () => {
  it("prints one line per order with progress, crafting and the blocked reason", () => {
    const crafting = {
      crafterId: 5,
      recipeId: "bake_bread",
      startedTick: 10,
      progressTicks: 7,
      durationTicks: 20,
    };
    expect(
      formatOrderList([order, { ...order, orderId: 4, crafting }], new Map([[3, "MissingRoom"]])),
    ).toEqual([
      "#3 bake_bread 1/4 at workstation #17: active, priority 50",
      "    blocked: MissingRoom",
      "#4 bake_bread 1/4 at workstation #17: active, priority 50, crafting 7/20 by #5",
    ]);
  });

  it("says when there are none and ignores foreign data", () => {
    expect(formatOrderList([], new Map())).toEqual(["no production orders"]);
    expect(formatOrderList("x", new Map())).toEqual([]);
  });
});

describe("formatOrderDetail", () => {
  it("prints the order, the posting and every reason", () => {
    expect(formatOrderDetail({ ...order, blocked: [reason] })).toEqual([
      "#3 bake_bread 1/4 at workstation #17: active, priority 50",
      "  posting #9",
      "  blocked: MissingInput materialId=flour required=1 available=0 noProducer=true cause=workstation#18",
    ]);
    expect(formatOrderDetail({ ...order, postingId: null, blocked: [] })).toEqual([
      "#3 bake_bread 1/4 at workstation #17: active, priority 50",
      "  no posting out",
      "  nothing blocks it",
    ]);
    expect(formatOrderDetail(null)).toEqual([]);
  });
});

describe("firstBlockedReason", () => {
  it("is the text of the first reason, null when nothing blocks", () => {
    expect(firstBlockedReason({ ...order, blocked: [reason] })).toContain("MissingInput");
    expect(firstBlockedReason({ ...order, blocked: [] })).toBeNull();
    expect(firstBlockedReason(null)).toBeNull();
  });
});
