import type { Entity, EntityId } from "../ecs/Entity";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { findSources } from "../storage/storageQueries";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { dwellingOf, dwellingStorage } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import { residentsOf } from "./household";
import { fetchTaskType } from "./housingTypes";
import { demandedGroups, groupStock } from "./suppliedGoods";
import type { DemandGroup } from "./suppliedGoods";

/**
 * A group whose stock in the household's storage is below `householdStockDays` days of demand.
 */
export type HouseholdShortfall = {
  group: DemandGroup;
  /**
   * Units of the group in the household's storage.
   */
  inStock: number;
  /**
   * Units that bring the stock up to `householdStockDays` days of demand.
   */
  shortfall: number;
};

/**
 * Where a fetch would take goods from.
 */
export type FetchPlan = {
  dwellingId: EntityId;
  materialId: string;
  quantity: number;
  sourceId: EntityId;
};

/**
 * The groups that a household of an active dwelling is short of (spec 029 FR-016): the stock in
 * its storage furniture is below `householdStockDays` days of the group's demand (`residents x
 * rate`). A dwelling that is inactive, has no residents or has no storage furniture has none (the
 * last one is reported as `NoHouseholdStorage`, no fetch is attempted).
 *
 * @param engine - The engine.
 * @param record - The dwelling.
 * @param residents - How many residents it has.
 * @returns The shortfalls in demand order.
 */
export function householdShortfalls(
  engine: GameEngine,
  record: DwellingRecord,
  residents: number,
): HouseholdShortfall[] {
  const storage = dwellingStorage(engine, record.zone);
  if (!record.zone.active || residents < 1 || storage.length === 0) {
    return [];
  }
  const days = engine.content.constants.householdStockDays;
  const shortfalls: HouseholdShortfall[] = [];
  for (const group of demandedGroups(engine, record.dwelling.level)) {
    const wantedMilli = days * residents * group.perResidentPerDay;
    const inStock = groupStock(storage, group.materialIds);
    if (inStock * 1000 < wantedMilli) {
      shortfalls.push({
        group,
        inStock,
        shortfall: Math.ceil((wantedMilli - inStock * 1000) / 1000),
      });
    }
  }
  return shortfalls;
}

/**
 * Whether a resident of the dwelling is already on a fetch (at most one per household).
 *
 * @param residents - The dwelling's residents.
 * @returns True when one of them has a `housing.fetch` task.
 */
export function fetchInProgress(residents: readonly Entity[]): boolean {
  return residents.some((resident) =>
    (getComponent(resident, taskQueueComponent)?.tasks ?? []).some(
      (task) => task.type === fetchTaskType,
    ),
  );
}

/**
 * What a resident would fetch now, or null (spec 029 FR-016): the first short group (demand
 * order) with a material that exists in the settlement outside the household, taken from the
 * nearest accessible storage (`findSources`, others' reservations respected; the resident's own
 * household storage is not a source). The quantity is bounded by what the source gives and by what
 * the resident can carry (the task takes what fits). Null when the household is not short of anything, a fetch is under way, or no source
 * exists (the status provider then reports `MissingInput`).
 *
 * @param engine - The engine.
 * @param resident - A settler with a home.
 * @returns The plan, or null.
 */
export function planFetch(engine: GameEngine, resident: Entity): FetchPlan | null {
  const home = getComponent(resident, citizenComponent)?.homeDwellingId ?? null;
  const record = home === null ? null : dwellingOf(engine, home);
  if (
    home === null ||
    record === null ||
    getComponent(resident, inventoryComponent) === undefined
  ) {
    return null;
  }
  const residents = residentsOf(engine, home);
  if (fetchInProgress(residents)) {
    return null;
  }
  for (const entry of householdShortfalls(engine, record, residents.length)) {
    for (const materialId of entry.group.materialIds) {
      const source = findSources(engine, resident, materialId, entry.shortfall, false)[0];
      if (source !== undefined) {
        return {
          dwellingId: home,
          materialId,
          quantity: Math.min(source.quantity, entry.shortfall),
          sourceId: source.entityId,
        };
      }
    }
  }
  return null;
}
