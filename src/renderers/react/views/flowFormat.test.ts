import { describe, expect, it } from "vitest";
import type { FlowParty, FlowRow } from "../../../game/status/statusTypes";
import { FlowSource, StatusSubjectKind } from "../../../game/status/statusTypes";
import {
  formatPerDay,
  sortByDeficit,
  sumBySource,
  trendArrow,
  trendDirection,
  TrendDirection,
} from "./flowFormat";

function row(materialId: string, netPerDayMilli: number): FlowRow {
  return {
    materialId,
    producedPerDayMilli: 0,
    consumedPerDayMilli: 0,
    netPerDayMilli,
    stock: 0,
    daysOfSupplyMilli: null,
    trend: [],
    windowProduced: 0,
    windowConsumed: 0,
    producers: [],
    consumers: [],
  };
}

describe("flowFormat", () => {
  it("formats milli amounts with one decimal", () => {
    expect(formatPerDay(0)).toBe("0.0");
    expect(formatPerDay(1500)).toBe("1.5");
    expect(formatPerDay(-2250)).toBe("-2.2");
  });

  it("reads the trend from the last two days", () => {
    expect(trendDirection([])).toBe(TrendDirection.Flat);
    expect(trendDirection([3])).toBe(TrendDirection.Flat);
    expect(trendDirection([1, 4])).toBe(TrendDirection.Up);
    expect(trendDirection([4, 1])).toBe(TrendDirection.Down);
    expect(trendDirection([2, 2])).toBe(TrendDirection.Flat);
    expect(trendArrow(TrendDirection.Up)).toBe("↑");
    expect(trendArrow(TrendDirection.Down)).toBe("↓");
    expect(trendArrow(TrendDirection.Flat)).toBe("→");
  });

  // @covers 024:FR-027 025:FR-018
  it("sorts the largest deficit first", () => {
    expect(
      sortByDeficit([row("b", 500), row("a", -3000), row("c", -3000), row("d", -10)]).map(
        (entry) => entry.materialId,
      ),
    ).toEqual(["a", "c", "d", "b"]);
  });

  it("sums quantities per source", () => {
    const parties: FlowParty[] = [
      {
        subject: { kind: StatusSubjectKind.Workstation, id: 1 },
        source: FlowSource.Recipe,
        quantity: 2,
      },
      { subject: null, source: FlowSource.Spoilage, quantity: 5 },
      {
        subject: { kind: StatusSubjectKind.Workstation, id: 2 },
        source: FlowSource.Recipe,
        quantity: 4,
      },
    ];
    expect(sumBySource(parties)).toEqual([
      { source: "Recipe", quantity: 6 },
      { source: "Spoilage", quantity: 5 },
    ]);
  });
});
