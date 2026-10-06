import { describe, expect, it } from "vitest";
import { advanceStreaks } from "./advanceStreaks";
import type { StreakInput } from "./advanceStreaks";

const base: StreakInput = {
  upgradeStreak: 0,
  downgradeStreak: 0,
  nextMet: false,
  currentMet: true,
  lowest: false,
  upgradeGraceDays: 3,
  downgradeGraceDays: 7,
};

describe("advanceStreaks", () => {
  it.each([
    // description, input changes, upgrade, downgrade, change, atRisk
    ["nothing changes while everything is fine", {}, 0, 0, null, false],
    ["the upgrade streak counts", { nextMet: true }, 1, 0, null, false],
    ["the second day", { nextMet: true, upgradeStreak: 1 }, 2, 0, null, false],
    ["the third day upgrades", { nextMet: true, upgradeStreak: 2 }, 0, 0, "up", false],
    ["a miss resets the upgrade streak", { nextMet: false, upgradeStreak: 2 }, 0, 0, null, false],
    ["the first failing day is at risk", { currentMet: false }, 0, 1, null, true],
    [
      "the second failing day is not announced again",
      { currentMet: false, downgradeStreak: 1 },
      0,
      2,
      null,
      false,
    ],
    ["a recovery on day 7 resets", { currentMet: true, downgradeStreak: 6 }, 0, 0, null, false],
    ["day 7 of failing downgrades", { currentMet: false, downgradeStreak: 6 }, 0, 0, "down", false],
    ["day 6 of failing holds", { currentMet: false, downgradeStreak: 5 }, 0, 6, null, false],
    [
      "a Hovel never builds a downgrade streak",
      { currentMet: false, lowest: true, downgradeStreak: 6 },
      0,
      0,
      null,
      false,
    ],
    [
      "an upgrade wins over a downgrade on the same day",
      { nextMet: true, upgradeStreak: 2, currentMet: false, downgradeStreak: 6 },
      0,
      0,
      "up",
      false,
    ],
    ["both streaks run at once", { nextMet: true, currentMet: false }, 1, 1, null, true],
  ] as const)("%s", (_name, change, upgrade, downgrade, level, atRisk) => {
    expect(advanceStreaks({ ...base, ...change })).toEqual({
      upgradeStreak: upgrade,
      downgradeStreak: downgrade,
      change: level,
      atRisk,
    });
  });

  // @covers 029:SC-002
  it("rises exactly upgradeGraceDays x 3 evaluations from Hovel to Burgher House (SC-001)", () => {
    let evaluations = 0;
    let levels = 0;
    let streak = { upgradeStreak: 0, downgradeStreak: 0 };
    while (levels < 3) {
      evaluations += 1;
      const result = advanceStreaks({ ...base, ...streak, nextMet: true });
      streak = result;
      if (result.change === "up") {
        levels += 1;
      }
    }
    expect(evaluations).toBe(9);
  });

  it("honours other grace values", () => {
    const result = advanceStreaks({ ...base, upgradeGraceDays: 1, nextMet: true });
    expect(result.change).toBe("up");
  });
});
