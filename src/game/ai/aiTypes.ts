import type { EntityId } from "../ecs/Entity";

/**
 * Id of the AI system (dependency name for systems that need `Needs`, `Mood`, `Health` or the
 * AI service).
 */
export const aiSystemId = "ai";

/**
 * Names of the PRNG streams the AI draws from (DECISIONS section 0 stream registry). The enum
 * value is the stream name.
 */
export enum AiStream {
  /**
   * Idle decisions: stand still or wander, and for how long.
   */
  Decide = "ai.decide",
  /**
   * Choice of the wander target cell.
   */
  Wander = "ai.wander",
  /**
   * Success rolls of risky actions, `chancePermille(riskSuccessPermille(mood))` (D-25).
   */
  Risk = "ai.risk",
}

/**
 * Task types registered by the AI. The enum value is the task type id.
 */
export enum AiTaskType {
  /**
   * Walks along a path, one step per `moveSpeed` progress (see `moveTask.ts`).
   */
  Move = "move",
  /**
   * Stands still until a tick.
   */
  Idle = "ai.idle",
  /**
   * Fetches a need source and consumes it, or sleeps.
   */
  Satisfy = "ai.satisfy",
}

/**
 * Task priorities used by the AI. A strictly higher priority interrupts the running task.
 */
export enum AiTaskPriority {
  /**
   * Wandering and standing around: preempted by everything else.
   */
  Idle = 10,
  /**
   * Satisfying a critical need.
   */
  Need = 100,
  /**
   * A need that dropped to zero (sleep where you stand): nothing but death interrupts it.
   */
  Collapse = 200,
}

/**
 * Highest value of a need, of mood and of health: 100 percent in milli-percent (DECISIONS D-04).
 */
export const maxMeterMilli = 100_000;

/**
 * Mood at which the risk mapping gives exactly 50 percent.
 */
export const neutralMoodMilli = 50_000;

/**
 * Most active mood influences kept on one entity (DECISIONS D-25).
 */
export const maxMoodInfluences = 8;

/**
 * Most relationships kept on one entity (DECISIONS D-25); the one with the oldest `lastTick` is
 * evicted first.
 */
export const maxRelationships = 16;

/**
 * Most history records kept per relationship (DECISIONS D-25).
 */
export const maxRelationshipHistory = 8;

/**
 * Need ids the AI knows by name (the pack authors the full list in `needs.json`).
 */
export enum KnownNeed {
  Hunger = "hunger",
  Rest = "rest",
  Safety = "safety",
  Social = "social",
  Comfort = "comfort",
  Faith = "faith",
}

/**
 * Cause carried by `entity.died` when hunger stayed at zero until health ran out.
 */
export const starvationCause = "Starvation";

/**
 * Event: an entity consumed an item to satisfy a need (spec 013 FR-023).
 */
export const needItemConsumedEvent = "need.item.consumed";

/**
 * Event: an entity died (DECISIONS section 4.2); it is deleted at slot 17.
 */
export const entityDiedEvent = "entity.died";

/**
 * Event: an entity took the first step of a move.
 */
export const movementStartedEvent = "entity.movement.started";

/**
 * Event: an entity arrived at the target of a move.
 */
export const movementCompletedEvent = "entity.movement.completed";

/**
 * Payload of `need.item.consumed`.
 */
export type NeedItemConsumed = {
  entityId: EntityId;
  needId: string;
  materialId: string;
  quantity: number;
};

/**
 * Payload of `entity.died`.
 */
export type EntityDied = {
  entityId: EntityId;
  cause: string;
};

/**
 * The level of one need.
 */
export type NeedValue = {
  needId: string;
  /**
   * Milli-percent `0..100000`.
   */
  valueMilli: number;
};

/**
 * Data of the `Needs` component: one value per need of the content pack, ascending by need id.
 */
export type NeedsData = {
  values: NeedValue[];
};

/**
 * A temporary push on mood: a source label, a signed milli-percent delta and the tick after which
 * it no longer counts.
 */
export type MoodInfluence = {
  source: string;
  deltaMilli: number;
  untilTick: number;
};

/**
 * Data of the `Mood` component (spec 013 FR-004).
 */
export type MoodData = {
  /**
   * Milli-percent `0..100000`.
   */
  valueMilli: number;
  /**
   * The recent influences, oldest first, at most {@link maxMoodInfluences}.
   */
  influences: MoodInfluence[];
};

/**
 * Data of the `Health` component.
 */
export type HealthData = {
  /**
   * Milli-percent `1..100000` while alive.
   */
  valueMilli: number;
};

/**
 * One remembered interaction with another entity.
 */
export type RelationshipEvent = {
  kind: string;
  deltaMilli: number;
  tick: number;
};

/**
 * What one entity feels about another (asymmetric, spec 013 FR-006/007).
 */
export type RelationshipEntry = {
  otherId: EntityId;
  /**
   * Personal affinity `-100000..100000` (DECISIONS D-04), on top of the faction baseline.
   */
  affinityMilli: number;
  lastTick: number;
  history: RelationshipEvent[];
};

/**
 * Data of the `Relationships` component: entries ascending by `otherId`.
 */
export type RelationshipsData = {
  entries: RelationshipEntry[];
};
