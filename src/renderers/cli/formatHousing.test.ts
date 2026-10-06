import { describe, expect, it } from "vitest";
import { formatHome, formatHomes } from "./formatHousing";

const totals = {
  dwellings: 2,
  activeDwellings: 1,
  housed: 2,
  homeless: 1,
  freeSlots: 0,
  perLevel: { hovel: 1, cottage: 0 },
  immigrationBlocked: null,
};
const row = {
  id: 63,
  level: "hovel",
  active: true,
  capacity: 2,
  residents: [4, 5],
  rentPerDay: 0,
  upgradeStreak: 1,
  downgradeStreak: 0,
  tiles: 4,
};
const requirement = (met: boolean, label: string) => ({ met, label });
const home = {
  ...row,
  mapId: 1,
  hasStorage: false,
  nextLevel: "cottage",
  current: { level: "hovel", met: true, requirements: [requirement(true, "tiles 4/4")] },
  next: {
    level: "cottage",
    met: false,
    requirements: [requirement(true, "tiles 6/6"), requirement(false, "distinct foods 1/2")],
  },
  upgradeGraceDays: 3,
  downgradeGraceDays: 7,
  foods: ["bread"],
  accumulators: {},
};

describe("formatHomes", () => {
  it("shows the totals and one line per dwelling", () => {
    expect(formatHomes(totals, [row, { ...row, id: 70, active: false, residents: [] }])).toEqual([
      "housing: 2 dwelling(s), 1 active; 2 housed, 1 homeless, 0 free slot(s); hovel 1, cottage 0",
      "#63 hovel active: 2/2 residents (#4, #5), 4 tiles, rent 0/day, streaks up 1 down 0",
      "#70 hovel INACTIVE: 0/2 residents (nobody), 4 tiles, rent 0/day, streaks up 1 down 0",
    ]);
  });

  it("says why settlers cannot come", () => {
    const lines = formatHomes({ ...totals, immigrationBlocked: "NoSeatOfGovernment" }, []);
    expect(lines[1]).toBe("settlers cannot come: NoSeatOfGovernment");
  });

  it("is empty for a foreign view", () => {
    expect(formatHomes(null, [])).toEqual([]);
    expect(formatHomes(totals, "x")).toEqual([]);
  });
});

describe("formatHome", () => {
  it("lists both checklists, the streaks and the foods", () => {
    expect(formatHome(home)).toEqual([
      "dwelling #63: hovel, active, 2 of 2 resident(s) (#4, #5), 4 tiles, rent 0/day, no storage",
      "upgrade streak 1/3 (to cottage), downgrade streak 0/7",
      "hovel (current level) holds:",
      "  [x] tiles 4/4",
      "cottage (next level) needs:",
      "  [x] tiles 6/6",
      "  [ ] distinct foods 1/2",
      "foods eaten lately: bread",
    ]);
  });

  it("marks a failing current level and the top level", () => {
    const lines = formatHome({
      ...home,
      active: false,
      hasStorage: true,
      nextLevel: null,
      next: null,
      foods: [],
      current: { level: "hovel", met: false, requirements: [requirement(false, "tiles 3/4")] },
    });
    expect(lines[0]).toContain("INACTIVE");
    expect(lines[1]).toContain("(top level)");
    expect(lines[2]).toBe("hovel (current level) FAILS:");
    expect(lines.at(-1)).toBe("foods eaten lately: none");
  });

  it("is empty for a foreign view", () => {
    expect(formatHome(null)).toEqual([]);
  });
});
