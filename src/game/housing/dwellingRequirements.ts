import { FurnitureRefKind } from "../content/contentTypes";
import type { DwellingLevel } from "../content/contentTypes";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getSettlementService } from "../settlement/settlementServiceRegistry";
import { hasReachedTier } from "../settlement/tierOrder";
import { toDay } from "../time/GameTime";
import { checkRequirement, formatRequirement } from "../zones/furnitureRequirements";
import type { FurniturePiece } from "../zones/furnitureRequirements";
import { activeZonesOfType } from "../zones/zoneQueries";
import { zoneComponent } from "../zones/zoneComponent";
import { getComponent } from "../ecs/Entity";
import { dwellingFurniture, dwellingStorage } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import { levelDefinition } from "./dwellingLevels";
import { DwellingRequirementKind, SupplyStatus } from "./housingTypes";
import type { DwellingRequirementStatus, LevelRequirements } from "./housingTypes";
import { multiSourceCosts } from "./multiSourceCosts";
import { demandedGroups, groupStock } from "./suppliedGoods";
import type { SupplyResult } from "./suppliedGoods";
import { supplyOutcome } from "./supplyOutcome";

/**
 * Everything the requirement checks of one dwelling share on one pass.
 */
export type RequirementContext = {
  engine: GameEngine;
  record: DwellingRecord;
  /**
   * The current game day.
   */
  day: number;
  residents: number;
  storage: Entity[];
  pieces: FurniturePiece[];
  /**
   * The supply results of the evaluation step that consumed goods today, or null (a query between
   * evaluations then previews today's step without consuming).
   */
  supply: readonly SupplyResult[] | null;
  /**
   * Costs from the dwelling's tiles, computed on first use.
   */
  costs: Int32Array | null;
};

/**
 * Starts a requirement pass for a dwelling.
 *
 * @param engine - The engine.
 * @param record - The dwelling.
 * @param residents - Its resident count.
 * @param supply - The results of the supply step that just ran, or null for a preview.
 * @returns The context.
 */
export function createRequirementContext(
  engine: GameEngine,
  record: DwellingRecord,
  residents: number,
  supply: readonly SupplyResult[] | null,
): RequirementContext {
  return {
    engine,
    record,
    day: toDay(engine.time.tickCount),
    residents,
    storage: dwellingStorage(engine, record.zone),
    pieces: dwellingFurniture(engine, record.zone),
    supply,
    costs: null,
  };
}

/**
 * The distinct foods a household ate inside the variety window ending today (spec 029 FR-007).
 *
 * @param foodRecord - Food material id to the last day eaten.
 * @param day - The current game day.
 * @param windowDays - `foodVarietyWindowDays`.
 * @returns Material ids, sorted.
 */
export function foodsInWindow(
  foodRecord: { [materialId: string]: number },
  day: number,
  windowDays: number,
): string[] {
  return Object.entries(foodRecord)
    .filter(([, eaten]) => eaten > day - windowDays)
    .map(([materialId]) => materialId)
    .sort();
}

/**
 * The cheapest path cost from the dwelling's tiles to a tile of an active zone of one of the types
 * (spec 029 FR-008), or null when no such zone is reachable. Cost only: no tie-breaking and no
 * randomness.
 *
 * @param context - The requirement pass.
 * @param zoneTypeIds - Zone types that serve.
 * @returns The cost, or null.
 */
export function nearestServiceCost(
  context: RequirementContext,
  zoneTypeIds: readonly string[],
): number | null {
  const { engine, record } = context;
  let best: number | null = null;
  for (const zoneTypeId of zoneTypeIds) {
    for (const zoneId of activeZonesOfType(engine, zoneTypeId)) {
      const zone = getComponent(engine.store.require(zoneId), zoneComponent);
      if (zone === undefined || zone.mapId !== record.zone.mapId || zoneId === record.entity.id) {
        continue;
      }
      context.costs ??= multiSourceCosts(engine.maps.require(record.zone.mapId), record.zone.tiles);
      for (const tile of zone.tiles) {
        const cost = context.costs[tile] ?? -1;
        if (cost >= 0 && (best === null || cost < best)) {
          best = cost;
        }
      }
    }
  }
  return best;
}

function blank(
  kind: DwellingRequirementKind,
  met: boolean,
  required: number,
  current: number,
  label: string,
): DwellingRequirementStatus {
  return {
    kind,
    met,
    required,
    current,
    label,
    furniture: null,
    zoneTypeIds: null,
    nearestPathCost: null,
    materialIds: null,
    inStock: null,
    needed: null,
    supplyStatus: null,
    requiredTier: null,
  };
}

function supplyStatusOf(
  context: RequirementContext,
  signature: string,
  materialIds: readonly string[],
  perResidentPerDay: number,
): { met: boolean; needed: number; inStock: number; status: SupplyStatus } {
  const inStock = groupStock(context.storage, materialIds);
  if (context.storage.length === 0) {
    const outcome = supplyOutcome(
      context.record.dwelling.consumptionAccumulators[signature] ?? 0,
      context.residents * perResidentPerDay,
      0,
    );
    return { met: false, needed: outcome.needed, inStock: 0, status: SupplyStatus.NoStorage };
  }
  const result = context.supply?.find((entry) => entry.signature === signature);
  if (result !== undefined) {
    return {
      met: result.met,
      needed: result.needed,
      inStock: inStock + result.consumed,
      status: result.met ? SupplyStatus.Met : SupplyStatus.Short,
    };
  }
  const preview = supplyOutcome(
    context.record.dwelling.consumptionAccumulators[signature] ?? 0,
    context.residents * perResidentPerDay,
    inStock,
  );
  return {
    met: preview.met,
    needed: preview.needed,
    inStock,
    status: preview.met ? SupplyStatus.Met : SupplyStatus.Short,
  };
}

/**
 * The requirements of one level for a dwelling, each with its status (spec 029 FR-007, FR-019):
 * `MinTiles`, one `Furniture` per furniture entry, `FoodVariety` (when the level asks for any),
 * one `ServiceNearby` per service, one `SuppliedGood` per group and `TierUnlocked` (when the level
 * has an unlock tier). Supplied goods use the results of today's supply step when the context has
 * them, otherwise they preview the step. Pure: it consumes nothing.
 *
 * @param context - The requirement pass.
 * @param level - The level whose requirements to check.
 * @returns The level's requirements and whether all of them hold.
 */
export function levelRequirements(
  context: RequirementContext,
  level: DwellingLevel,
): LevelRequirements {
  const { engine, record } = context;
  const definition = levelDefinition(engine, level);
  const requirements: DwellingRequirementStatus[] = [];
  const tileCount = record.zone.tiles.length;
  requirements.push(
    blank(
      DwellingRequirementKind.MinTiles,
      tileCount >= definition.minTiles,
      definition.minTiles,
      tileCount,
      `tiles ${tileCount}/${definition.minTiles}`,
    ),
  );
  for (const entry of definition.furniture) {
    const requirement = {
      alternatives: [
        {
          match: entry.kind === FurnitureRefKind.Tag ? { tag: entry.ref } : { id: entry.ref },
          count: entry.count,
          perTiles: null,
        },
      ],
    };
    const check = checkRequirement(requirement, tileCount, context.pieces);
    requirements.push({
      ...blank(
        DwellingRequirementKind.Furniture,
        check.met,
        check.required,
        check.present,
        `${entry.ref} ${check.present}/${check.required}`,
      ),
      furniture: formatRequirement(requirement),
    });
  }
  if (definition.foodVariety > 0) {
    const foods = foodsInWindow(
      record.dwelling.foodRecord,
      context.day,
      engine.content.constants.foodVarietyWindowDays,
    ).length;
    requirements.push(
      blank(
        DwellingRequirementKind.FoodVariety,
        foods >= definition.foodVariety,
        definition.foodVariety,
        foods,
        `distinct foods ${foods}/${definition.foodVariety}`,
      ),
    );
  }
  for (const service of definition.services) {
    const nearest = nearestServiceCost(context, service.zoneTypeIds);
    requirements.push({
      ...blank(
        DwellingRequirementKind.ServiceNearby,
        nearest !== null && nearest <= service.maxPathCells,
        service.maxPathCells,
        nearest ?? 0,
        nearest === null
          ? `${service.zoneTypeIds.join(" or ")} none reachable (limit ${service.maxPathCells})`
          : `${service.zoneTypeIds.join(" or ")} ${nearest}/${service.maxPathCells} path cost`,
      ),
      zoneTypeIds: [...service.zoneTypeIds],
      nearestPathCost: nearest,
    });
  }
  for (const good of definition.suppliedGoods) {
    const group = demandedGroups(engine, record.dwelling.level).find(
      (entry) => entry.signature === good.materialIds.join("|"),
    );
    const status = supplyStatusOf(
      context,
      good.materialIds.join("|"),
      good.materialIds,
      group?.perResidentPerDay ?? good.perResidentPerDay,
    );
    requirements.push({
      ...blank(
        DwellingRequirementKind.SuppliedGood,
        status.met,
        status.needed,
        status.inStock,
        status.status === SupplyStatus.NoStorage
          ? `${good.materialIds.join(" or ")}: no household storage`
          : status.inStock === 0 && !status.met
            ? `${good.materialIds.join(" or ")}: none in stock`
            : `${good.materialIds.join(" or ")} ${status.inStock} in stock, ${status.needed} due`,
      ),
      materialIds: [...good.materialIds],
      inStock: status.inStock,
      needed: status.needed,
      supplyStatus: status.status,
    });
  }
  if (definition.unlockTier !== undefined) {
    const tier = getSettlementService(engine).tier();
    requirements.push({
      ...blank(
        DwellingRequirementKind.TierUnlocked,
        hasReachedTier(tier, definition.unlockTier),
        0,
        0,
        `unlocks at ${definition.unlockTier}`,
      ),
      requiredTier: definition.unlockTier,
    });
  }
  return { level, met: requirements.every((entry) => entry.met), requirements };
}

/**
 * The names of the unmet requirements of a level, for events and reasons (`MinTiles`,
 * `Furniture:1x tag:bed`, `FoodVariety`, `ServiceNearby:chapel|church`, `SuppliedGood:ale`,
 * `TierUnlocked:village`).
 *
 * @param requirements - A level's requirements.
 * @returns One string per unmet requirement.
 */
export function unmetNames(requirements: LevelRequirements): string[] {
  return requirements.requirements
    .filter((entry) => !entry.met)
    .map((entry) => {
      const detail =
        entry.furniture ??
        entry.zoneTypeIds?.join("|") ??
        entry.materialIds?.join("|") ??
        entry.requiredTier;
      return detail === null || detail === undefined ? entry.kind : `${entry.kind}:${detail}`;
    });
}
