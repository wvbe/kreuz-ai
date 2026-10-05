import { describe, expect, it } from "vitest";
import type { EventRecord } from "../../game/api/CommandResult";
import type { StateView } from "../../game/api/Views";
import {
  formatCharacter,
  formatClock,
  formatEntityDetail,
  formatEntityList,
  formatEvents,
  formatIdentity,
  formatNeeds,
  formatNeedsSummary,
  formatStatus,
  maxPrintedEvents,
  styledNameOf,
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

  it("prints the styled name of named entities", () => {
    expect(
      formatEntityList(
        {
          total: 2,
          offset: 0,
          entities: [
            { id: 1, prototype: "government_faction" },
            { id: 3, prototype: "baker" },
          ],
        },
        new Map([[3, "Ansel the Baker"]]),
      ),
    ).toEqual(["entities 1-2 of 2", "  #1 government_faction", "  #3 baker Ansel the Baker"]);
  });

  it("appends a need and action summary when given", () => {
    expect(
      formatEntityList(
        { total: 1, offset: 0, entities: [{ id: 3, prototype: "baker" }] },
        new Map(),
        new Map([[3, "hunger 40% | idle"]]),
      ),
    ).toEqual(["entities 1-1 of 1", "  #3 baker  [hunger 40% | idle]"]);
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

describe("formatCharacter", () => {
  const skills = {
    dominantSkill: "baking",
    skills: [
      { skillId: "baking", level: 40 },
      { skillId: "farming", level: 0 },
      { skillId: "hauling", level: 5 },
    ],
  };
  const traits = {
    traits: [{ name: "Strong", effects: ["hauling performance x1.3"] }],
  };

  it("lists non-zero skills, the dominant one and the traits with effects", () => {
    expect(formatCharacter(skills, traits)).toEqual([
      "  skills: baking 40, hauling 5 (dominant: baking)",
      "  traits: Strong (hauling performance x1.3)",
    ]);
  });

  it("says none for an empty character", () => {
    expect(formatCharacter({ dominantSkill: null, skills: [] }, { traits: [] })).toEqual([
      "  skills: none",
      "  traits: none",
    ]);
  });

  it("prints nothing for entities without the views", () => {
    expect(formatCharacter(null, null)).toEqual([]);
  });
});

describe("styledNameOf", () => {
  it("reads the styled name of an identity view", () => {
    expect(styledNameOf({ styledName: "Ansel the Baker", givenName: "Ansel" })).toBe(
      "Ansel the Baker",
    );
  });

  it("is null for anything else", () => {
    expect(styledNameOf(null)).toBeNull();
    expect(styledNameOf({ givenName: "Ansel" })).toBeNull();
  });
});

describe("formatIdentity", () => {
  it("prints the styled name and the factions", () => {
    expect(
      formatIdentity(
        { styledName: "Ansel the Baker" },
        { entityId: 3, factions: [{ id: 1, name: "Settlement" }] },
      ),
    ).toEqual(["  name: Ansel the Baker", "  factions: #1 Settlement"]);
  });

  it("prints nothing for entities without the views or without factions", () => {
    expect(formatIdentity(null, null)).toEqual([]);
    expect(formatIdentity(null, { entityId: 1, factions: [] })).toEqual([]);
  });
});

const needsView = {
  entityId: 3,
  needs: [
    { needId: "faith", name: "Faith", valueMilli: 74_000, percent: 74, critical: false },
    { needId: "hunger", name: "Hunger", valueMilli: 18_500, percent: 18, critical: true },
    { needId: "rest", name: "Rest", valueMilli: 35_000, percent: 35, critical: false },
  ],
  moodMilli: 61_562,
  riskSuccessPermille: 585,
  healthMilli: 99_000,
  role: "worker",
  priorityOrder: ["hunger", "rest", "faith"],
  coins: 0,
  wealth: "poor",
  action: "move to cell 326",
};

describe("formatNeedsSummary", () => {
  it("shows hunger, rest, mood and the action in one line, marking critical needs", () => {
    expect(formatNeedsSummary(needsView)).toBe("hunger 18%! rest 35% mood 61% | move to cell 326");
  });

  it("is null for anything that is not a needs view", () => {
    expect(formatNeedsSummary(null)).toBeNull();
    expect(formatNeedsSummary({ entityId: 1 })).toBeNull();
  });

  it("skips needs the entity does not have", () => {
    expect(formatNeedsSummary({ ...needsView, needs: [] })).toBe("mood 61% | move to cell 326");
  });
});

describe("formatNeeds", () => {
  it("prints all needs, mood, health, role, wealth, priorities and the action", () => {
    expect(formatNeeds(needsView)).toEqual([
      "  needs: faith 74%, hunger 18%!, rest 35%",
      "  mood: 61%  health: 99%  role: worker  wealth: poor (0 coins)",
      "  priorities: hunger > rest > faith",
      "  action: move to cell 326",
    ]);
  });

  it("prints nothing for entities without needs", () => {
    expect(formatNeeds(null)).toEqual([]);
  });
});
