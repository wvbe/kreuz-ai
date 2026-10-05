import { describe, expect, it } from "vitest";
import {
  isImmediateReason,
  makeReason,
  reasonKey,
  reasonPrecedence,
  refKey,
  sortReasons,
  statusKey,
  toReasonKind,
} from "./reasons";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "./statusTypes";

describe("makeReason", () => {
  it("builds a reason with default params and no cause", () => {
    expect(makeReason(BlockedReasonKind.NoOrders)).toEqual({
      kind: BlockedReasonKind.NoOrders,
      params: {},
      causeRef: null,
    });
    const cause = { kind: StatusSubjectKind.Zone, id: 4 };
    expect(makeReason(BlockedReasonKind.MissingRoom, { zoneTypeId: "bakery" }, cause)).toEqual({
      kind: BlockedReasonKind.MissingRoom,
      params: { zoneTypeId: "bakery" },
      causeRef: cause,
    });
  });
});

describe("refKey", () => {
  it("joins kind and id", () => {
    expect(refKey({ kind: StatusSubjectKind.JobPosting, id: 9 })).toBe("JobPosting#9");
  });
});

describe("reasonKey", () => {
  it("uses the kind plus the first identifying param and ignores counters", () => {
    const flour = makeReason(BlockedReasonKind.MissingInput, {
      materialId: "flour",
      required: 2,
      available: 0,
    });
    const moreFlour = makeReason(BlockedReasonKind.MissingInput, {
      materialId: "flour",
      required: 2,
      available: 1,
    });
    const water = makeReason(BlockedReasonKind.MissingInput, { materialId: "water" });
    expect(reasonKey(flour)).toBe("MissingInput:flour");
    expect(reasonKey(moreFlour)).toBe(reasonKey(flour));
    expect(reasonKey(water)).not.toBe(reasonKey(flour));
    expect(reasonKey(makeReason(BlockedReasonKind.NoOrders))).toBe("NoOrders");
  });
});

describe("statusKey", () => {
  it("is Active without reasons and the state plus primary identity otherwise", () => {
    expect(statusKey({ state: StatusState.Active, activity: null, reasons: [] })).toBe("Active");
    expect(
      statusKey({
        state: StatusState.Idle,
        activity: null,
        reasons: [makeReason(BlockedReasonKind.NoJobsAvailable, { jobBoardId: 2 })],
      }),
    ).toBe("Idle|NoJobsAvailable:2");
  });
});

describe("isImmediateReason", () => {
  it("is true for the spec 025 FR-006 kinds only", () => {
    expect(isImmediateReason(makeReason(BlockedReasonKind.Paused))).toBe(true);
    expect(isImmediateReason(makeReason(BlockedReasonKind.NoOrders))).toBe(true);
    expect(isImmediateReason(makeReason(BlockedReasonKind.MissingInput))).toBe(false);
  });
});

describe("sortReasons", () => {
  it("orders by precedence and keeps the source order of equal kinds", () => {
    const sorted = sortReasons([
      makeReason(BlockedReasonKind.OutputBlocked, { materialId: "bread" }),
      makeReason(BlockedReasonKind.MissingInput, { materialId: "b" }),
      makeReason(BlockedReasonKind.MissingInput, { materialId: "a" }),
      makeReason(BlockedReasonKind.Paused),
      makeReason(BlockedReasonKind.ZoneInactive, { zoneId: 3 }),
    ]);
    expect(sorted.map((reason) => reason.kind)).toEqual([
      BlockedReasonKind.Paused,
      BlockedReasonKind.ZoneInactive,
      BlockedReasonKind.MissingInput,
      BlockedReasonKind.MissingInput,
      BlockedReasonKind.OutputBlocked,
    ]);
    expect(sorted.map((reason) => reason.params["materialId"])).toEqual([
      undefined,
      undefined,
      "b",
      "a",
      "bread",
    ]);
  });

  it("lists the 23 spec kinds first, in the FR-004 order", () => {
    expect(reasonPrecedence.slice(0, 5)).toEqual([
      BlockedReasonKind.Paused,
      BlockedReasonKind.NoSeatOfGovernment,
      BlockedReasonKind.NoSteward,
      BlockedReasonKind.LockedByTier,
      BlockedReasonKind.ScopeZoneMissing,
    ]);
    expect(reasonPrecedence.indexOf(BlockedReasonKind.NoOrders)).toBe(23);
    expect(reasonPrecedence.length).toBe(25);
  });
});

describe("toReasonKind", () => {
  it("maps a known name and rejects an unknown one", () => {
    expect(toReasonKind("MissingTool")).toBe(BlockedReasonKind.MissingTool);
    expect(() => toReasonKind("Nope")).toThrow(/unknown blocked reason kind/);
  });
});
