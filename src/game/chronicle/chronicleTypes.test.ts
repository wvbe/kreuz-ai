import { describe, expect, it } from "vitest";
import { NotableMomentKind } from "../content/contentTypes";
import { MomentProminence, prominenceOfKind } from "./chronicleTypes";

describe("prominenceOfKind", () => {
  it("makes exactly the D-17 kinds Major, and Arrived Minor", () => {
    const major = Object.values(NotableMomentKind).filter(
      (kind) => prominenceOfKind[kind] === MomentProminence.Major,
    );
    expect(major).toEqual([
      NotableMomentKind.MasteryAchieved,
      NotableMomentKind.BecameFinest,
      NotableMomentKind.TookOffice,
      NotableMomentKind.Died,
      NotableMomentKind.SettlementMilestone,
      NotableMomentKind.TierReached,
    ]);
    expect(prominenceOfKind[NotableMomentKind.Arrived]).toBe(MomentProminence.Minor);
  });
});
