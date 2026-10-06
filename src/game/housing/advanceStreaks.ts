/**
 * How a daily evaluation changes the level of a dwelling.
 */
export enum LevelChange {
  Up = "up",
  Down = "down",
}

/**
 * What a daily evaluation did to the streaks of one dwelling.
 */
export type StreakResult = {
  upgradeStreak: number;
  downgradeStreak: number;
  /**
   * `Up` or `Down` when the level changes by one now (both streaks are 0 then), else null.
   */
  change: LevelChange | null;
  /**
   * The downgrade streak became 1 on this evaluation (the first failing day; spec 029 FR-020).
   */
  atRisk: boolean;
};

/**
 * The inputs of {@link advanceStreaks}.
 */
export type StreakInput = {
  upgradeStreak: number;
  downgradeStreak: number;
  /**
   * Every requirement of the next level holds; false at the top level or when the next level is
   * tier-locked.
   */
  nextMet: boolean;
  /**
   * Every requirement of the current level holds.
   */
  currentMet: boolean;
  /**
   * The dwelling is a Hovel (never drops below it, so it keeps no downgrade streak).
   */
  lowest: boolean;
  upgradeGraceDays: number;
  downgradeGraceDays: number;
};

/**
 * The streak rules of spec 029 FR-011 for one evaluation of an active, inhabited dwelling: the
 * upgrade streak counts consecutive days on which the next level's requirements hold (and resets
 * on a miss), the downgrade streak counts consecutive days on which a current-level requirement is
 * unmet. Reaching the grace days changes the level by exactly one and resets both streaks; a
 * dwelling never changes level twice in one evaluation (an upgrade wins). A Hovel keeps no
 * downgrade streak.
 *
 * @param input - Streaks, the two requirement flags and the grace days.
 * @returns The new streaks, the level change and the at-risk flag.
 */
export function advanceStreaks(input: StreakInput): StreakResult {
  const upgradeStreak = input.nextMet ? input.upgradeStreak + 1 : 0;
  if (upgradeStreak >= input.upgradeGraceDays) {
    return { upgradeStreak: 0, downgradeStreak: 0, change: LevelChange.Up, atRisk: false };
  }
  const downgradeStreak = input.currentMet || input.lowest ? 0 : input.downgradeStreak + 1;
  if (downgradeStreak >= input.downgradeGraceDays) {
    return { upgradeStreak: 0, downgradeStreak: 0, change: LevelChange.Down, atRisk: false };
  }
  return { upgradeStreak, downgradeStreak, change: null, atRisk: downgradeStreak === 1 };
}
