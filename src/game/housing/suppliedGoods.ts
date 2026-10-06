import type { DwellingLevel } from "../content/contentTypes";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { retrieve } from "../inventory/inventoryOperations";
import { getTotal } from "../inventory/inventoryQueries";
import { dwellingStorage } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import { levelDefinition, nextLevelOf } from "./dwellingLevels";
import { goodsConsumedEvent } from "./housingTypes";
import { supplyOutcome } from "./supplyOutcome";
import type { SupplyOutcome } from "./supplyOutcome";

/**
 * One supplied-good group of a level (spec 029 FR-009): an any-of list of materials, tried in
 * order, and the demand per resident and day in milli-units.
 */
export type DemandGroup = {
  /**
   * The accumulator key: `materialIds.join("|")` (DECISIONS D-28).
   */
  signature: string;
  materialIds: string[];
  perResidentPerDay: number;
};

/**
 * What one day's supply step did to a group.
 */
export type SupplyResult = SupplyOutcome & {
  signature: string;
  /**
   * Units taken per material, in the order of the group.
   */
  taken: { materialId: string; quantity: number }[];
};

/**
 * The accumulator key of a group (DECISIONS D-28: keyed by the group, not by its index).
 *
 * @param materialIds - The group's materials in order of use.
 * @returns The signature.
 */
export function groupSignature(materialIds: readonly string[]): string {
  return materialIds.join("|");
}

/**
 * The goods a household demands at a level: the union of the supplied-good groups of the current
 * and the next level (spec 029 FR-010). A group that both levels name once is demanded at the
 * higher rate (DECISIONS D-28). The order is the current level's groups, then the new groups of
 * the next level.
 *
 * @param engine - The engine.
 * @param level - The dwelling's current level.
 * @returns The groups.
 */
export function demandedGroups(engine: GameEngine, level: DwellingLevel): DemandGroup[] {
  const groups: DemandGroup[] = [];
  const next = nextLevelOf(level);
  for (const source of next === null ? [level] : [level, next]) {
    for (const good of levelDefinition(engine, source).suppliedGoods) {
      const signature = groupSignature(good.materialIds);
      const known = groups.find((group) => group.signature === signature);
      if (known === undefined) {
        groups.push({
          signature,
          materialIds: [...good.materialIds],
          perResidentPerDay: good.perResidentPerDay,
        });
      } else if (good.perResidentPerDay > known.perResidentPerDay) {
        known.perResidentPerDay = good.perResidentPerDay;
      }
    }
  }
  return groups;
}

/**
 * Units of a group that a household's storage holds.
 *
 * @param storage - The storage furniture on the dwelling's tiles.
 * @param materialIds - The group's materials.
 * @returns The total over all materials and all storage.
 */
export function groupStock(storage: readonly Entity[], materialIds: readonly string[]): number {
  return storage.reduce(
    (sum, entity) =>
      sum +
      (getComponent(entity, inventoryComponent) === undefined
        ? 0
        : materialIds.reduce((inner, materialId) => inner + getTotal(entity, materialId), 0)),
    0,
  );
}

function takeUnits(
  engine: GameEngine,
  storage: readonly Entity[],
  materialIds: readonly string[],
  units: number,
): { materialId: string; quantity: number }[] {
  const taken: { materialId: string; quantity: number }[] = [];
  let missing = units;
  for (const materialId of materialIds) {
    let quantity = 0;
    for (const entity of storage) {
      const here = Math.min(missing, getTotal(entity, materialId));
      if (here > 0) {
        retrieve(
          { materials: engine.materials, actor: null, bus: engine.bus },
          entity,
          materialId,
          here,
        );
        quantity += here;
        missing -= here;
      }
    }
    if (quantity > 0) {
      taken.push({ materialId, quantity });
    }
  }
  return taken;
}

/**
 * The supply step of a dwelling's daily evaluation (spec 029 FR-009, FR-010, step 2): for every
 * demanded group the day's demand (`residents x rate`) goes through the accumulator model
 * (`supplyOutcome`); when the household's storage holds the whole units due they are taken (materials
 * in the group's order, furniture by ascending id) and `housing.goods.consumed` is queued per
 * material. A dwelling without storage furniture consumes nothing and meets nothing. Accumulators
 * of groups that are no longer demanded are dropped (DECISIONS D-28); the rest stay.
 *
 * @param engine - The engine.
 * @param record - The dwelling.
 * @param residents - How many residents it has now.
 * @returns The result per demanded group, in demand order.
 */
export function runSupplyStep(
  engine: GameEngine,
  record: DwellingRecord,
  residents: number,
): SupplyResult[] {
  const groups = demandedGroups(engine, record.dwelling.level);
  const storage = dwellingStorage(engine, record.zone);
  const accumulators = record.dwelling.consumptionAccumulators;
  const results: SupplyResult[] = [];
  for (const key of Object.keys(accumulators)) {
    if (!groups.some((group) => group.signature === key)) {
      delete accumulators[key];
    }
  }
  for (const group of groups) {
    const outcome = supplyOutcome(
      accumulators[group.signature] ?? 0,
      residents * group.perResidentPerDay,
      storage.length === 0 ? 0 : groupStock(storage, group.materialIds),
    );
    const taken =
      outcome.consumed > 0 ? takeUnits(engine, storage, group.materialIds, outcome.consumed) : [];
    for (const item of taken) {
      engine.bus.emit(goodsConsumedEvent, {
        dwellingId: record.entity.id,
        materialId: item.materialId,
        quantity: item.quantity,
      });
    }
    accumulators[group.signature] = outcome.accumulator;
    results.push({
      ...outcome,
      met: storage.length > 0 && outcome.met,
      signature: group.signature,
      taken,
    });
  }
  return results;
}
