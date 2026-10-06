import type { EntityId } from "../ecs/Entity";
import type { MilestoneKind, SettlementTier, TierRequirementKind } from "../content/contentTypes";

/**
 * Id of the settlement system (tier evaluation at slot 15, milestone detection, the queries
 * `settlement-progress`, `unlocks` and `milestones`).
 */
export const settlementSystemId = "settlement";

/**
 * Event: the settlement reached a higher tier (`{tier, previousTier, tick}`).
 */
export const tierReachedEvent = "settlement.tier.reached";

/**
 * Event: a milestone was reached for the first time (`{milestone, tick, subjectIds}`).
 */
export const milestoneReachedEvent = "settlement.milestone.reached";

/**
 * Event of the housing system (task 4.5) that drives `first-dwelling-upgrade`; the payload's
 * `dwellingId` (when present) becomes the milestone's subject.
 */
export const dwellingUpgradedEvent = "housing.dwelling.upgraded";

/**
 * Zone type ids whose first active zone is the milestone `first-worship-space` (spec 027 FR-019).
 * Ids that the content pack does not have are simply never active.
 */
export const worshipZoneTypeIds: readonly string[] = ["chapel", "church"];

/**
 * Zone type id of the milestone `first-market`.
 */
export const marketZoneTypeId = "market";

/**
 * Zone type id of the milestone `throne-room-established`.
 */
export const throneRoomZoneTypeId = "throne_room";

/**
 * The kinds of content that an unlock tier can lock (spec 027 `LockedContentKind`).
 */
export enum LockedContentKind {
  Furniture = "furniture",
  ZoneType = "zone_type",
  Recipe = "recipe",
  JobType = "job_type",
  DwellingLevel = "dwelling_level",
}

/**
 * One reached milestone (spec 027): kept once per game, in the order reached.
 */
export type MilestoneRecord = {
  milestone: MilestoneKind;
  tick: number;
  subjectIds: EntityId[];
};

/**
 * Data of the `SettlementProgress` component on the government faction (spec 027 FR-002,
 * DECISIONS D-05). Requirement status is derived, never stored (FR-023); the two counters are
 * bookkeeping of the daily evaluation.
 */
export type SettlementProgressData = {
  tier: SettlementTier;
  /**
   * The tick each reached tier was reached (`0` for the starting tier and every lower tier).
   */
  tierReachedAtTick: { [tier: string]: number };
  milestones: MilestoneRecord[];
  /**
   * How many daily evaluations ran.
   */
  evaluations: number;
  /**
   * Tick of the last daily evaluation, null before the first.
   */
  lastEvaluationTick: number | null;
};

/**
 * A moment of the settlement chronicle (task 4.6 fills it; the shape follows the event
 * `chronicle.moment.recorded`).
 */
export type ChronicleMoment = {
  momentId: number;
  tick: number;
  kind: string;
  prominence: string;
  entityId: EntityId | null;
  nameSnapshot: string | null;
  params: { [name: string]: string | number | boolean | null };
};

/**
 * One entry of the chronicle's finest-holder table (spec 028 FR-018).
 */
export type FinestEntry = {
  skillId: string;
  entityId: EntityId;
  level: number;
  sinceTick: number;
  lastAnnouncedTick: number;
};

/**
 * Data of the `SettlementChronicle` component on the government faction (spec 028 FR-018). Task
 * 4.4 only creates and saves it; task 4.6 records into it.
 */
export type SettlementChronicleData = {
  moments: ChronicleMoment[];
  finest: FinestEntry[];
  nextMomentId: number;
};

/**
 * Payload of `settlement.tier.reached`.
 */
export type TierReached = {
  tier: string;
  previousTier: string;
  tick: number;
};

/**
 * Payload of `settlement.milestone.reached`.
 */
export type MilestoneReached = {
  milestone: string;
  tick: number;
  subjectIds: EntityId[];
};

/**
 * The status of one tier requirement (spec 027 FR-006): `current` is computed when asked.
 */
export type RequirementProgress = {
  kind: TierRequirementKind;
  /**
   * Parameters of the requirement from the content: `level`, `zoneTypeIds`, `milestone`.
   */
  params: { [name: string]: string | string[] };
  current: number;
  target: number;
  met: boolean;
  /**
   * One line of text for a terminal: `population 6/8`.
   */
  label: string;
};

/**
 * Result of the pure tier evaluation (`evaluateTier`).
 */
export type TierEvaluation = {
  tier: SettlementTier;
  /**
   * The next tier, null at the highest.
   */
  nextTier: SettlementTier | null;
  requirements: RequirementProgress[];
  /**
   * Every requirement of the next tier holds (false at the highest tier).
   */
  allMet: boolean;
};

/**
 * View behind the query `settlement-progress`.
 */
export type SettlementProgressView = {
  tier: SettlementTier;
  settlementNoun: string;
  tierReachedAtTick: { [tier: string]: number };
  nextTier: SettlementTier | null;
  nextSettlementNoun: string | null;
  requirements: RequirementProgress[];
  milestones: MilestoneRecord[];
  evaluations: number;
  lastEvaluationTick: number | null;
};

/**
 * One row of the query `unlocks`.
 */
export type UnlockView = {
  contentKind: LockedContentKind;
  contentId: string;
  name: string;
  unlockTier: SettlementTier;
  unlocked: boolean;
  /**
   * `Unlocks at Village` for locked content, null when unlocked (spec 027 US5).
   */
  lockText: string | null;
};
