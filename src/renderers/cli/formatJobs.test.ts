import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../game/engine/EventBus";
import { formatBoard, maxPrintedHistory } from "./formatJobs";

function posting(id: number, overrides: Record<string, JsonValue> = {}): Record<string, JsonValue> {
  return {
    id,
    jobTypeId: "fell.trees",
    target: { mapId: 1, cellIndex: 40 + id },
    priority: 50,
    urgent: false,
    wage: 2,
    status: "open",
    claimantId: null,
    reason: null,
    ...overrides,
  };
}

const board = {
  boardId: 2,
  mapId: 1,
  cellIndex: 7,
  mode: "system-managed",
  paused: false,
  pausedByPlayer: false,
  pausedBySystem: false,
  open: 1,
  claimed: 1,
  postings: [posting(1), posting(2, { status: "claimed", claimantId: 5, urgent: true })],
  history: [posting(3, { status: "failed", reason: "target_invalid" })],
};

describe("formatBoard", () => {
  it("prints the header, the active postings and the finished ones", () => {
    expect(formatBoard(board)).toEqual([
      "board #2 system-managed at map 1 cell 7 running: 1 open, 1 claimed",
      "  #1 fell.trees open prio 50 wage 2 at cell 41",
      "  #2 fell.trees claimed by #5 prio 50 urgent wage 2 at cell 42",
      "  finished:",
      "  #3 fell.trees failed prio 50 wage 2 at cell 43 (target_invalid)",
    ]);
  });

  it("names who paused the board and says when there are no postings", () => {
    const lines = formatBoard({
      ...board,
      pausedByPlayer: true,
      pausedBySystem: true,
      postings: [],
      history: [],
    });
    expect(lines).toEqual([
      "board #2 system-managed at map 1 cell 7 paused by player+system: 1 open, 1 claimed",
      "  no postings",
    ]);
  });

  it("caps the history and ignores things that are not a board", () => {
    const many = Array.from({ length: 9 }, (_unused, index) => posting(index + 1));
    expect(formatBoard({ ...board, history: many }).length).toBe(1 + 2 + 1 + maxPrintedHistory);
    expect(formatBoard(null)).toEqual([]);
    expect(formatBoard({ nope: true })).toEqual([]);
  });
});
