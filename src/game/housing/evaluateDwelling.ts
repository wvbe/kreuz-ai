import type { GameEngine } from "../engine/GameEngine";
import { advanceStreaks, LevelChange } from "./advanceStreaks";
import { createRequirementContext, levelRequirements, unmetNames } from "./dwellingRequirements";
import type { DwellingRecord } from "./dwellingZones";
import { nextLevelOf, previousLevelOf } from "./dwellingLevels";
import {
  dwellingAtRiskEvent,
  dwellingDowngradedEvent,
  dwellingUpgradedEvent,
} from "./housingTypes";
import type { DwellingLevelChanged, LevelRequirements } from "./housingTypes";
import type { SupplyResult } from "./suppliedGoods";

/**
 * What the requirement step found for one dwelling.
 */
export type DwellingEvaluation = {
  current: LevelRequirements;
  next: LevelRequirements | null;
  change: LevelChange | null;
};

/**
 * Step 3 of the daily evaluation for one active, inhabited dwelling (spec 029 FR-007, FR-011,
 * FR-020): checks the requirements of the current and the next level (supplied goods use the
 * results of today's supply step), advances the streaks by `advanceStreaks` and applies the one
 * level change that results. It queues `housing.dwelling.at-risk` on the first failing day, and
 * `housing.dwelling.upgraded` / `housing.dwelling.downgraded` with the old and the new level. A
 * level change resets both streaks; a Hovel never drops.
 *
 * @param engine - The engine.
 * @param record - The dwelling (its component is updated).
 * @param residents - How many residents it has.
 * @param supply - The results of the supply step that ran today.
 * @returns The requirement status and the level change.
 */
export function evaluateDwelling(
  engine: GameEngine,
  record: DwellingRecord,
  residents: number,
  supply: readonly SupplyResult[],
): DwellingEvaluation {
  const context = createRequirementContext(engine, record, residents, supply);
  const level = record.dwelling.level;
  const nextLevel = nextLevelOf(level);
  const current = levelRequirements(context, level);
  const next = nextLevel === null ? null : levelRequirements(context, nextLevel);
  const result = advanceStreaks({
    upgradeStreak: record.dwelling.upgradeStreak,
    downgradeStreak: record.dwelling.downgradeStreak,
    nextMet: next?.met ?? false,
    currentMet: current.met,
    lowest: previousLevelOf(level) === null,
    upgradeGraceDays: engine.content.constants.upgradeGraceDays,
    downgradeGraceDays: engine.content.constants.downgradeGraceDays,
  });
  record.dwelling.upgradeStreak = result.upgradeStreak;
  record.dwelling.downgradeStreak = result.downgradeStreak;
  const dwellingId = record.entity.id;
  if (result.atRisk) {
    engine.bus.emit(dwellingAtRiskEvent, {
      dwellingId,
      level,
      unmetRequirements: unmetNames(current),
    });
  }
  const target =
    result.change === LevelChange.Up
      ? nextLevel
      : result.change === LevelChange.Down
        ? previousLevelOf(level)
        : null;
  if (target !== null) {
    record.dwelling.level = target;
    const payload: DwellingLevelChanged = { dwellingId, fromLevel: level, toLevel: target };
    engine.bus.emit(
      result.change === LevelChange.Up ? dwellingUpgradedEvent : dwellingDowngradedEvent,
      payload,
    );
  }
  return { current, next, change: result.change };
}
