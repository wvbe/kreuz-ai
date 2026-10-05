import { describe, expect, it } from "vitest";
import {
  describeStatusReason,
  formatExplanation,
  formatFlow,
  formatFlowOf,
  formatIdleBlocked,
} from "./formatStatus";

const missingInput = {
  kind: "MissingInput",
  params: { materialId: "flour", required: 1, available: 0, noProducer: false },
  causeRef: { kind: "Workstation", id: 11 },
};

const explanation = {
  subject: { kind: "Workstation", id: 12 },
  state: "Blocked",
  activity: null,
  reasons: [missingInput],
  chain: [
    {
      subject: { kind: "Workstation", id: 12 },
      state: "Blocked",
      activity: null,
      reason: missingInput,
    },
    {
      subject: { kind: "Workstation", id: 11 },
      state: "Blocked",
      activity: null,
      reason: {
        kind: "MissingInput",
        params: { materialId: "wheat", required: 2, available: 0, noProducer: true },
        causeRef: null,
      },
    },
  ],
  end: "Complete",
};

describe("describeStatusReason", () => {
  it("prints the kind, the params and the cause", () => {
    expect(describeStatusReason(missingInput)).toBe(
      "MissingInput materialId=flour required=1 available=0 noProducer=false cause=Workstation#11",
    );
  });

  it("prints list and object params", () => {
    expect(
      describeStatusReason({
        kind: "ZoneRequirementsUnmet",
        params: { gaps: [{ kind: "not-enclosed", required: null }] },
        causeRef: null,
      }),
    ).toBe("ZoneRequirementsUnmet gaps=[{kind=not-enclosed,required=null}]");
  });
});

describe("formatExplanation", () => {
  it("prints the subject, its reasons and the chain of causes", () => {
    expect(formatExplanation(explanation)).toEqual([
      "Workstation#12: Blocked",
      "  MissingInput materialId=flour required=1 available=0 noProducer=false cause=Workstation#11",
      "  because (Complete):",
      "    Workstation#11: Blocked MissingInput materialId=wheat required=2 available=0 noProducer=true",
    ]);
  });

  it("prints an Active subject with its activity and no chain", () => {
    expect(
      formatExplanation({
        subject: { kind: "Citizen", id: 4 },
        state: "Active",
        activity: { kind: "Working", params: { jobTypeId: "fell.trees", postingId: 3 } },
        reasons: [],
        chain: [
          { subject: { kind: "Citizen", id: 4 }, state: "Active", activity: null, reason: null },
        ],
        end: "Complete",
      }),
    ).toEqual(["Citizen#4: Active (Working jobTypeId=fell.trees postingId=3)"]);
  });

  it("returns nothing for a foreign view", () => {
    expect(formatExplanation(null)).toEqual([]);
  });
});

describe("formatIdleBlocked", () => {
  it("prints one line per row and marks the settling ones", () => {
    const lines = formatIdleBlocked([
      {
        subject: { kind: "Citizen", id: 4 },
        state: "Idle",
        reasons: [{ kind: "NoJobsAvailable", params: { jobBoardId: 2 }, causeRef: null }],
        sinceTick: 120,
        settled: true,
      },
      {
        subject: { kind: "Workstation", id: 12 },
        state: "Blocked",
        reasons: [missingInput],
        sinceTick: 130,
        settled: false,
      },
    ]);
    expect(lines).toEqual([
      "Citizen#4 Idle since 120: NoJobsAvailable jobBoardId=2",
      "Workstation#12 Blocked since 130 (settling): MissingInput materialId=flour required=1 available=0 noProducer=false cause=Workstation#11",
    ]);
  });

  it("says so when nothing is idle, and ignores a foreign view", () => {
    expect(formatIdleBlocked([])).toEqual(["nothing is idle or blocked"]);
    expect(formatIdleBlocked({})).toEqual([]);
  });
});

const bread = {
  materialId: "bread",
  producedPerDayMilli: 6000,
  consumedPerDayMilli: 8000,
  netPerDayMilli: -2000,
  stock: 10,
  daysOfSupplyMilli: 5000,
  trend: [-2, -2, -2],
  windowProduced: 18,
  windowConsumed: 24,
  producers: [{ subject: { kind: "Workstation", id: 12 }, source: "Recipe", quantity: 18 }],
  consumers: [{ subject: { kind: "Citizen", id: 3 }, source: "NeedConsumption", quantity: 24 }],
};

describe("formatFlow", () => {
  it("prints produced, consumed, net, stock and days of supply per material", () => {
    expect(formatFlow([bread])).toEqual([
      "bread: +6.0/day -8.0/day net -2.0/day, stock 10, 5.0 days of supply, trend -2,-2,-2",
    ]);
    expect(formatFlow([{ ...bread, netPerDayMilli: 500, daysOfSupplyMilli: null }])[0]).toContain(
      "surplus",
    );
  });

  it("says so when the ledger is empty", () => {
    expect(formatFlow([])).toEqual(["no production or consumption recorded yet"]);
    expect(formatFlow("x")).toEqual([]);
  });
});

describe("formatFlowOf", () => {
  it("adds the window totals and who produced and consumed", () => {
    expect(formatFlowOf(bread)).toEqual([
      "bread: +6.0/day -8.0/day net -2.0/day, stock 10, 5.0 days of supply, trend -2,-2,-2",
      "  window: produced 18, consumed 24",
      "  produced by 18 Recipe Workstation#12",
      "  consumed by 24 NeedConsumption Citizen#3",
    ]);
    expect(formatFlowOf(null)).toEqual([]);
  });
});
