import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../game/engine/EventBus";
import { formatChronicle, formatJournal, formatJournalTail } from "./formatChronicle";

function moment(id: number, prominence: string, text: string): JsonValue {
  return {
    momentId: id,
    tick: id * 10,
    day: 1,
    kind: "first_work",
    prominence,
    entityId: 3,
    nameSnapshot: "Odo",
    params: {},
    text,
  };
}

describe("formatChronicle", () => {
  it("shows the counts and marks Major moments", () => {
    const view = {
      total: 5,
      capacity: 200,
      moments: [moment(2, "major", "Odo took office."), moment(1, "major", "Odo has died.")],
    };
    expect(formatChronicle(view)).toEqual([
      "chronicle: 2 of 5 entries (it keeps 200)",
      "  * day 1, tick 20: Odo took office.",
      "  * day 1, tick 10: Odo has died.",
    ]);
  });

  it("is empty for a foreign view", () => {
    expect(formatChronicle(null)).toEqual([]);
    expect(formatChronicle({ total: "x" })).toEqual([]);
  });
});

describe("formatJournal", () => {
  it("lists the entries of a journal", () => {
    const view = {
      entityId: 3,
      capacity: 16,
      entries: [moment(1, "minor", "Odo has come to the hamlet.")],
    };
    expect(formatJournal(view)).toEqual([
      "journal of #3: 1 of 16 entries",
      "    day 1, tick 10: Odo has come to the hamlet.",
    ]);
    expect(formatJournal(null)).toEqual([]);
  });
});

describe("formatJournalTail", () => {
  it("shows the last entries only, and nothing for an empty journal", () => {
    const entries = [1, 2, 3, 4].map((id) => moment(id, "minor", `line ${id}`));
    expect(formatJournalTail({ entityId: 3, capacity: 16, entries }, 2)).toEqual([
      "  journal:",
      "    day 1: line 3",
      "    day 1: line 4",
    ]);
    expect(formatJournalTail({ entityId: 3, capacity: 16, entries: [] }, 2)).toEqual([]);
    expect(formatJournalTail(null, 2)).toEqual([]);
  });
});
