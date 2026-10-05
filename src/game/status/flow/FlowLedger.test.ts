import { describe, expect, it } from "vitest";
import { FlowDirection, FlowSource, ledgerWindowDays, StatusSubjectKind } from "../statusTypes";
import type { FlowEntry } from "../statusTypes";
import { FlowLedger } from "./FlowLedger";

function entry(
  materialId: string,
  quantity: number,
  overrides: Partial<FlowEntry> = {},
): FlowEntry {
  return {
    materialId,
    direction: FlowDirection.Produced,
    source: FlowSource.Recipe,
    subject: { kind: StatusSubjectKind.Workstation, id: 5 },
    quantity,
    ...overrides,
  };
}

describe("FlowLedger.record", () => {
  it("adds up units with the same material, direction, source and subject", () => {
    const ledger = new FlowLedger();
    ledger.record(2, entry("bread", 2));
    ledger.record(2, entry("bread", 4));
    ledger.record(2, entry("bread", 1, { source: FlowSource.Gathering }));
    ledger.record(2, entry("bread", 3, { subject: null }));
    const [day] = ledger.dayList();
    expect(day?.entries.map((item) => item.quantity).sort()).toEqual([1, 3, 6]);
  });

  it("ignores amounts below 1", () => {
    const ledger = new FlowLedger();
    ledger.record(0, entry("bread", 0));
    ledger.record(0, entry("bread", -3));
    expect(ledger.dayList()).toEqual([]);
  });
});

describe("FlowLedger.prune", () => {
  it("keeps the current day and the last ledgerWindowDays complete days", () => {
    const ledger = new FlowLedger();
    for (let day = 0; day <= 12; day += 1) {
      ledger.record(day, entry("bread", 1));
    }
    expect(ledger.prune(12)).toBe(12 - ledgerWindowDays);
    expect(ledger.dayList().map((day) => day.day)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(ledger.prune(12)).toBe(0);
  });
});

describe("FlowLedger.dayList", () => {
  it("returns days ascending with entries in canonical order, as copies", () => {
    const ledger = new FlowLedger();
    ledger.record(3, entry("flour", 1));
    ledger.record(1, entry("bread", 1));
    ledger.record(1, entry("apple", 1));
    const days = ledger.dayList();
    expect(days.map((day) => day.day)).toEqual([1, 3]);
    expect(days[0]?.entries.map((item) => item.materialId)).toEqual(["apple", "bread"]);
    const first = days[0]?.entries[0];
    if (first !== undefined) {
      first.quantity = 99;
    }
    expect(ledger.dayList()[0]?.entries[0]?.quantity).toBe(1);
  });
});

describe("FlowLedger.createSection", () => {
  it("round-trips through JSON", () => {
    const ledger = new FlowLedger();
    ledger.record(4, entry("bread", 2));
    ledger.record(4, entry("wheat", 4, { direction: FlowDirection.Consumed, subject: null }));
    ledger.record(5, entry("bread", 1));
    const section = ledger.createSection();
    const restored = new FlowLedger();
    restored.createSection().restore(JSON.parse(JSON.stringify(section.serialize())));
    expect(restored.dayList()).toEqual(ledger.dayList());
    expect(section.key).toBe("productionLedger");
    expect(section.defaultForOlderSaves?.()).toEqual({ days: [] });
  });

  it("replaces the previous contents on restore and rejects bad data", () => {
    const ledger = new FlowLedger();
    ledger.record(1, entry("bread", 1));
    const section = ledger.createSection();
    section.restore({ days: [] });
    expect(ledger.dayList()).toEqual([]);
    expect(() => section.restore({ days: [{ day: -1, entries: [] }] })).toThrow();
    expect(() =>
      section.restore({
        days: [{ day: 0, entries: [{ materialId: "x", direction: "Sideways" }] }],
      }),
    ).toThrow();
  });
});
