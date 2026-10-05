import { describe, expect, it } from "vitest";
import type { EventRecord } from "../../game/api/CommandResult";
import type { StateView } from "../../game/api/Views";
import {
  formatClock,
  formatEntityDetail,
  formatEntityList,
  formatEvents,
  formatStatus,
  maxPrintedEvents,
} from "./formatViews";

const state: StateView = {
  hasGame: true,
  time: {
    tick: 30,
    paused: true,
    speed: 1000,
    tickIntervalMs: 6250,
    day: 2,
    tickOfDay: 6,
    hourOfDay: 7,
  },
  seed: 9,
  difficulty: "steady",
  startingTier: "hamlet",
  entityCount: 4,
  mapCount: 1,
  pendingCommandCount: 0,
};

describe("formatClock", () => {
  it("pads the hour", () => {
    expect(formatClock(7)).toBe("07:00");
    expect(formatClock(13)).toBe("13:00");
  });
});

describe("formatStatus", () => {
  it("summarizes a running game", () => {
    expect(formatStatus(state)).toEqual([
      "tick 30  day 2  07:00  paused  speed 1000  interval 6250ms",
      "seed 9  difficulty steady  tier hamlet",
      "entities 4  maps 1  pending commands 0",
    ]);
  });

  it("explains how to start when there is no game", () => {
    expect(formatStatus({ ...state, hasGame: false })[0]).toContain("no game");
  });
});

describe("formatEvents", () => {
  const events: EventRecord[] = Array.from({ length: 12 }, (_value, index) => ({
    seq: index + 1,
    tick: index,
    name: "demo",
    payload: { index },
  }));

  it("prints the newest events and counts the rest", () => {
    const lines = formatEvents(events);
    expect(lines).toHaveLength(maxPrintedEvents + 1);
    expect(lines[0]).toContain("2 earlier events");
    expect(lines[1]).toBe('  [3] t2 demo {"index":2}');
  });

  it("prints everything when it fits", () => {
    expect(formatEvents(events.slice(0, 2))).toHaveLength(2);
  });
});

describe("formatEntityList", () => {
  it("lists a page", () => {
    expect(
      formatEntityList({ total: 5, offset: 2, entities: [{ id: 3, prototype: "peasant" }] }),
    ).toEqual(["entities 3-3 of 5", "  #3 peasant"]);
  });

  it("says when empty", () => {
    expect(formatEntityList({ total: 0, offset: 0, entities: [] })).toEqual([
      "no entities (total 0)",
    ]);
  });
});

describe("formatEntityDetail", () => {
  it("prints components sorted by name", () => {
    expect(
      formatEntityDetail(
        { id: 2, prototype: "peasant", components: { Zed: 1, Position: { mapId: 1 } } },
        2,
      ),
    ).toEqual(["#2 peasant", '  Position: {"mapId":1}', "  Zed: 1"]);
  });

  it("handles a missing entity", () => {
    expect(formatEntityDetail(null, 8)).toEqual(["no entity #8"]);
  });
});
