import type { DwellingLevel } from "../content/contentTypes";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { createRequirementContext, foodsInWindow, levelRequirements } from "./dwellingRequirements";
import { dwellingCapacity, dwellingOf, dwellingStorage, listDwellings } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import { isAtOrAbove, levelDefinition, nextLevelOf, orderedLevels } from "./dwellingLevels";
import { homelessCitizens, residentsByDwelling } from "./household";
import { getHousingService } from "./housingServiceRegistry";
import type {
  DwellingSummary,
  DwellingView,
  HousingTotals,
  LevelRequirements,
} from "./housingTypes";
import { toDay } from "../time/GameTime";

/**
 * The number of active dwellings at or above a level (spec 029 FR-019 `countDwellingsAtOrAbove`,
 * the hook of the tier requirement `dwellings_at_level`).
 *
 * @param engine - The engine.
 * @param level - A dwelling level.
 * @returns The count.
 */
export function countDwellingsAtOrAbove(engine: GameEngine, level: DwellingLevel): number {
  return listDwellings(engine).filter(
    (record) => record.zone.active && isAtOrAbove(record.dwelling.level, level),
  ).length;
}

function summarize(
  engine: GameEngine,
  record: DwellingRecord,
  residents: readonly { id: EntityId }[],
): DwellingSummary {
  return {
    id: record.entity.id,
    level: record.dwelling.level,
    active: record.zone.active,
    capacity: dwellingCapacity(engine, record),
    residents: residents.map((entity) => entity.id),
    rentPerDay: levelDefinition(engine, record.dwelling.level).rentPerDay,
    upgradeStreak: record.dwelling.upgradeStreak,
    downgradeStreak: record.dwelling.downgradeStreak,
    tiles: record.zone.tiles.length,
  };
}

/**
 * The rows of the query `dwellings`: every dwelling, ascending by id.
 *
 * @param engine - The engine.
 * @returns The summaries.
 */
export function buildDwellingSummaries(engine: GameEngine): DwellingSummary[] {
  const residents = residentsByDwelling(engine);
  return listDwellings(engine).map((record) =>
    summarize(engine, record, residents.get(record.entity.id) ?? []),
  );
}

/**
 * The view behind the query `dwelling {id}` (spec 029 FR-019, `getDwelling` plus
 * `getDwellingRequirementStatus`): level, capacity, residents, rent, both streaks and the grace
 * days, the requirements of the current and of the next level with their numbers, and the food and
 * accumulator state. The requirements are derived now (supplied goods preview today's step), never
 * trusted from a save.
 *
 * @param engine - The engine.
 * @param dwellingId - A zone entity id.
 * @returns The view, or null when the entity is no dwelling.
 */
export function buildDwellingView(engine: GameEngine, dwellingId: EntityId): DwellingView | null {
  const record = dwellingOf(engine, dwellingId);
  if (record === null) {
    return null;
  }
  const residents = residentsByDwelling(engine).get(dwellingId) ?? [];
  const context = createRequirementContext(engine, record, residents.length, null);
  const nextLevel = nextLevelOf(record.dwelling.level);
  const current: LevelRequirements = levelRequirements(context, record.dwelling.level);
  const next = nextLevel === null ? null : levelRequirements(context, nextLevel);
  return {
    ...summarize(engine, record, residents),
    mapId: record.zone.mapId,
    hasStorage: dwellingStorage(engine, record.zone).length > 0,
    nextLevel,
    current,
    next,
    upgradeGraceDays: engine.content.constants.upgradeGraceDays,
    downgradeGraceDays: engine.content.constants.downgradeGraceDays,
    foods: foodsInWindow(
      record.dwelling.foodRecord,
      toDay(engine.time.tickCount),
      engine.content.constants.foodVarietyWindowDays,
    ),
    accumulators: { ...record.dwelling.consumptionAccumulators },
  };
}

/**
 * The view behind the query `housing`: how many dwellings, how many citizens are housed or
 * homeless, the free slots of the active dwellings and the active dwellings per level, plus why
 * settlers could not come at the last evaluation.
 *
 * @param engine - The engine.
 * @returns The totals.
 */
export function buildHousingTotals(engine: GameEngine): HousingTotals {
  const residents = residentsByDwelling(engine);
  const perLevel: { [level: string]: number } = {};
  for (const level of orderedLevels) {
    perLevel[level] = 0;
  }
  let housed = 0;
  let freeSlots = 0;
  let active = 0;
  const dwellings = listDwellings(engine);
  for (const record of dwellings) {
    const here = residents.get(record.entity.id)?.length ?? 0;
    housed += here;
    if (record.zone.active) {
      active += 1;
      perLevel[record.dwelling.level] = (perLevel[record.dwelling.level] ?? 0) + 1;
      freeSlots += Math.max(0, dwellingCapacity(engine, record) - here);
    }
  }
  return {
    dwellings: dwellings.length,
    activeDwellings: active,
    housed,
    homeless: homelessCitizens(engine).length,
    freeSlots,
    perLevel,
    immigrationBlocked: getHousingService(engine).immigrationBlocked(),
  };
}
