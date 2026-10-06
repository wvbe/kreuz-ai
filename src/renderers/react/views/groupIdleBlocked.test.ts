import { describe, expect, it } from "vitest";
import type { IdleBlockedRow } from "../../../game/status/statusTypes";
import {
  StatusState,
  StatusSubjectKind,
  BlockedReasonKind,
} from "../../../game/status/statusTypes";
import { groupIdleBlocked } from "./groupIdleBlocked";

function row(id: number, kind: BlockedReasonKind, sinceTick: number): IdleBlockedRow {
  return {
    subject: { kind: StatusSubjectKind.Workstation, id },
    state: StatusState.Blocked,
    reasons: [{ kind, params: {}, causeRef: null }],
    sinceTick,
    settled: true,
  };
}

describe("groupIdleBlocked", () => {
  it("returns nothing for no rows", () => {
    expect(groupIdleBlocked([])).toEqual([]);
  });

  // @covers 024:FR-026 025:FR-017
  it("groups by primary reason, rows and groups oldest first", () => {
    const groups = groupIdleBlocked([
      row(1, BlockedReasonKind.MissingInput, 50),
      row(2, BlockedReasonKind.NoOrders, 10),
      row(3, BlockedReasonKind.MissingInput, 20),
      row(4, BlockedReasonKind.NoOrders, 10),
    ]);
    expect(groups.map((group) => group.kind)).toEqual(["NoOrders", "MissingInput"]);
    expect(groups[0]?.rows.map((entry) => entry.subject.id)).toEqual([2, 4]);
    expect(groups[1]?.rows.map((entry) => entry.subject.id)).toEqual([3, 1]);
  });

  it("files rows without reasons under Unexplained", () => {
    const empty: IdleBlockedRow = { ...row(9, BlockedReasonKind.NoOrders, 1), reasons: [] };
    expect(groupIdleBlocked([empty])[0]?.kind).toBe("Unexplained");
  });
});
