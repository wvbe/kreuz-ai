import type { DwellingLevel } from "../content/contentTypes";
import type { EntityId } from "../ecs/Entity";

/**
 * Id of the housing system (slot 13, the daily evaluation, the queries `dwellings`, `dwelling`,
 * `housing` and `dwellings-at-or-above`).
 */
export const housingSystemId = "housing";

/**
 * Name of the PRNG stream that draws the prototype of an arriving settler (spec 029 FR-015).
 */
export const housingStreamName = "housing.immigration";

/**
 * Task type of the household fetch chore (spec 029 FR-016).
 */
export const fetchTaskType = "housing.fetch";

/**
 * Id of the behavior action that starts the fetch chore (spec 029 FR-016, the name of spec 022
 * FR-014).
 */
export const fetchHouseholdGoodsId = "fetch_household_goods";

/**
 * Id of the behavior condition that is true while the settler's household wants goods.
 */
export const householdNeedsGoodsId = "household_needs_goods";

/**
 * Event: a dwelling rose one level (`{dwellingId, fromLevel, toLevel}`); the milestone
 * `first-dwelling-upgrade` and the moment `HomeImproved` listen to it.
 */
export const dwellingUpgradedEvent = "housing.dwelling.upgraded";

/**
 * Event: a dwelling dropped one level (`{dwellingId, fromLevel, toLevel}`).
 */
export const dwellingDowngradedEvent = "housing.dwelling.downgraded";

/**
 * Event: the first failing evaluation of the current level (`{dwellingId, level,
 * unmetRequirements}`).
 */
export const dwellingAtRiskEvent = "housing.dwelling.at-risk";

/**
 * Event: a citizen was assigned a home (`{dwellingId, entityId}`).
 */
export const residentAssignedEvent = "housing.resident.assigned";

/**
 * Event: a citizen lost its home to the dwelling (`{dwellingId, entityId, reason}`).
 */
export const residentEvictedEvent = "housing.resident.evicted";

/**
 * Event: rent reached the treasury (`{dwellingId, amount}`).
 */
export const rentCollectedEvent = "housing.rent.collected";

/**
 * Event: rent was not (fully) paid (`{dwellingId, shortfall, reason}`).
 */
export const rentUnpaidEvent = "housing.rent.unpaid";

/**
 * Event: a household used up goods (`{dwellingId, materialId, quantity}`); the flow ledger records
 * it as `HouseholdConsumption`.
 */
export const goodsConsumedEvent = "housing.goods.consumed";

/**
 * Event: a settler arrived (`{entityId, prototypeId, dwellingId}`).
 */
export const immigrantArrivedEvent = "housing.immigrant.arrived";

/**
 * Event: no settler can arrive (`{reason}`).
 */
export const immigrationBlockedEvent = "housing.immigration.blocked";

/**
 * Kinds of requirement of a dwelling level (spec 029 FR-007). The enum value is the serialized
 * kind.
 */
export enum DwellingRequirementKind {
  MinTiles = "MinTiles",
  Furniture = "Furniture",
  FoodVariety = "FoodVariety",
  ServiceNearby = "ServiceNearby",
  SuppliedGood = "SuppliedGood",
  TierUnlocked = "TierUnlocked",
}

/**
 * Why a citizen lost its home (spec 029 FR-020). The enum value is the serialized reason.
 */
export enum EvictionReason {
  CapacityReduced = "CapacityReduced",
  DwellingChanged = "DwellingChanged",
  DwellingRemoved = "DwellingRemoved",
}

/**
 * Why rent was not paid in full (spec 029 FR-013). The enum value is the serialized reason.
 */
export enum RentShortfallReason {
  InsufficientFunds = "InsufficientFunds",
  TreasuryUnavailable = "TreasuryUnavailable",
}

/**
 * Why no settler arrives (spec 029 FR-015). The enum value is the serialized reason.
 */
export enum ImmigrationBlockedReason {
  NoSeatOfGovernment = "NoSeatOfGovernment",
  NoArrivalCell = "NoArrivalCell",
}

/**
 * How a supplied good stands (spec 029 `SuppliedGood { status }`). The enum value is the
 * serialized status.
 */
export enum SupplyStatus {
  /**
   * The day's units are in storage (or none are due today).
   */
  Met = "met",
  /**
   * Fewer units in storage than the day needs.
   */
  Short = "short",
  /**
   * The dwelling has no storage furniture at all.
   */
  NoStorage = "no-storage",
}

/**
 * Data of the `Dwelling` component on a dwelling zone entity (spec 029 FR-004). Level, streaks,
 * accumulators and the food record are authoritative progression state; requirement satisfaction
 * is derived again after a load.
 */
export type DwellingData = {
  level: DwellingLevel;
  upgradeStreak: number;
  downgradeStreak: number;
  /**
   * Milli-units of unconsumed demand per supplied-good group, keyed by the group signature
   * (`materialIds.join("|")`, DECISIONS D-28).
   */
  consumptionAccumulators: { [signature: string]: number };
  /**
   * Food material id to the last game day a resident ate it; only the variety window is kept.
   */
  foodRecord: { [materialId: string]: number };
  /**
   * The game day of the last daily evaluation, null before the first.
   */
  lastEvaluatedDay: number | null;
};

/**
 * The status of one requirement of a level (spec 029 FR-019): `required` and `current` are the
 * numbers to show (tiles, pieces, foods, path cost or units); the nullable fields belong to one
 * kind each.
 */
export type DwellingRequirementStatus = {
  kind: DwellingRequirementKind;
  met: boolean;
  required: number;
  current: number;
  /**
   * One line for a terminal.
   */
  label: string;
  /**
   * `Furniture`: the requirement as `2x tag:bed`.
   */
  furniture: string | null;
  /**
   * `ServiceNearby`: the zone types that serve.
   */
  zoneTypeIds: string[] | null;
  /**
   * `ServiceNearby`: the cheapest path cost to an active service zone, null when none is reachable
   * (`current` is 0 then); `required` is the limit.
   */
  nearestPathCost: number | null;
  /**
   * `SuppliedGood`: the group's material ids, in order of use.
   */
  materialIds: string[] | null;
  /**
   * `SuppliedGood`: units of the group in the household's storage.
   */
  inStock: number | null;
  /**
   * `SuppliedGood`: whole units today's evaluation needs.
   */
  needed: number | null;
  supplyStatus: SupplyStatus | null;
  /**
   * `TierUnlocked`: the tier the level needs.
   */
  requiredTier: string | null;
};

/**
 * Requirements of one level, for the current or the next level of a dwelling.
 */
export type LevelRequirements = {
  level: DwellingLevel;
  met: boolean;
  requirements: DwellingRequirementStatus[];
};

/**
 * One dwelling as the query `dwellings` lists it.
 */
export type DwellingSummary = {
  id: EntityId;
  level: DwellingLevel;
  active: boolean;
  capacity: number;
  residents: EntityId[];
  rentPerDay: number;
  upgradeStreak: number;
  downgradeStreak: number;
  tiles: number;
};

/**
 * The view behind the query `dwelling {id}` (spec 029 FR-019).
 */
export type DwellingView = DwellingSummary & {
  mapId: number;
  hasStorage: boolean;
  /**
   * The next level, null at the top.
   */
  nextLevel: DwellingLevel | null;
  /**
   * Requirements of the current level (they decide a downgrade).
   */
  current: LevelRequirements;
  /**
   * Requirements of the next level (they decide an upgrade), null at the top.
   */
  next: LevelRequirements | null;
  upgradeGraceDays: number;
  downgradeGraceDays: number;
  /**
   * Distinct foods eaten inside the variety window.
   */
  foods: string[];
  /**
   * Accumulated demand in milli-units per group signature.
   */
  accumulators: { [signature: string]: number };
};

/**
 * Totals of the query `housing`.
 */
export type HousingTotals = {
  dwellings: number;
  activeDwellings: number;
  housed: number;
  homeless: number;
  freeSlots: number;
  /**
   * Active dwellings per level.
   */
  perLevel: { [level: string]: number };
  /**
   * Why settlers could not come at the last evaluation, null when they could or none were due.
   */
  immigrationBlocked: ImmigrationBlockedReason | null;
};

/**
 * Payload of `housing.dwelling.upgraded` and `housing.dwelling.downgraded`.
 */
export type DwellingLevelChanged = {
  dwellingId: EntityId;
  fromLevel: DwellingLevel;
  toLevel: DwellingLevel;
};
