import type { EntityId } from "../ecs/Entity";

/**
 * Id of the fauna system (dependency name for systems that need `Animal` or the fauna handlers).
 */
export const faunaSystemId = "fauna";

/**
 * Id of the slot-4 system that grows hunger and periodic products.
 */
export const faunaTickSystemId = "fauna.tick";

/**
 * Names of the PRNG streams the fauna draws from (DECISIONS D-140). Animals never use the AI
 * streams of the settlers, so adding animals does not change what a settler decides. The enum
 * value is the stream name.
 */
export enum FaunaStream {
  /**
   * Where wild animals are placed at world generation.
   */
  World = "world.fauna",
  /**
   * Standing or walking, graze targets and the length of a rest.
   */
  Move = "fauna.move",
  /**
   * Whether a predator tries a kill this decision.
   */
  Hunt = "fauna.hunt",
}

/**
 * Task priorities of animal behavior; stalking sits between wandering (10) and a claimed job
 * (50), fleeing above it, so a threat interrupts a stroll.
 */
export enum FaunaTaskPriority {
  Stalk = 40,
  Flee = 60,
}

/**
 * Kinds of entity an animal senses.
 */
export enum SenseKind {
  /**
   * A settler or any other entity with `Citizen`.
   */
  Humanoid = "humanoid",
  /**
   * A predator animal (threat level at least {@link predatorThreatLevel}).
   */
  Predator = "predator",
}

/**
 * Threat level from which an animal counts as a predator for livestock.
 */
export const predatorThreatLevel = 2;

/**
 * Prototypes whose presence keeps predators away from livestock (spec 022 US11 scenario 3).
 */
export const guardPrototypeIds: readonly string[] = ["guard", "soldier"];

/**
 * Hunger gained per tick, milli-percent (full in 1000 ticks, about 3.5 days).
 */
export const animalHungerPerTick = 100;

/**
 * Hunger from which an animal looks for food, milli-percent.
 */
export const animalHungryMilli = 40_000;

/**
 * Hunger lost per tick while standing on a diet terrain, milli-percent.
 */
export const animalEatPerTick = 2_000;

/**
 * How long a grazing animal stands on its food cell per decision, ticks.
 */
export const grazeStandTicks = 12;

/**
 * Path cost radius of one wander or graze trip (about 6 cells of normal terrain).
 */
export const animalWanderRadiusCost = 60;

/**
 * Per mille chance that a wandering animal stands still instead of walking.
 */
export const animalStandChance = 400;

/**
 * Lower bound of the standing time of an idle animal, ticks.
 */
export const animalStandMinTicks = 6;

/**
 * Upper bound of the standing time of an idle animal, ticks.
 */
export const animalStandMaxTicks = 24;

/**
 * How long a fleeing animal freezes after it arrived, ticks. It lets a hunter catch up; animals
 * and settlers move at the same speed (DECISIONS D-140).
 */
export const fleeFreezeTicks = 8;

/**
 * Most distance a fleeing animal runs in one go, as path cost (about 4 cells).
 */
export const fleeDistanceCost = 40;

/**
 * Path cost within which an animal is "adjacent" to another for attacks and for catching (one
 * cell of normal terrain and a bit).
 */
export const contactCost = 25;

/**
 * Per mille chance that a predator that sees prey starts a hunt in one decision (kills are rare).
 */
export const predatorHuntChance = 250;

/**
 * Health a predator takes off an animal per attack, milli-percent of full health.
 */
export const attackDamageMilli = 25_000;

/**
 * Health a humanoid loses to an aggressive animal per attack, milli-percent.
 */
export const humanoidAttackDamageMilli = 8_000;

/**
 * Lowest health an animal attack leaves a humanoid with (there is no combat system yet, so an
 * attack hurts but never kills).
 */
export const humanoidHealthFloorMilli = 1_000;

/**
 * Ticks between two attacks of one animal.
 */
export const attackCooldownTicks = 12;

/**
 * Event: an animal was removed from the world (butchered, hunted, killed by a predator, stolen).
 */
export const animalDiedEvent = "animal.died";

/**
 * Event: a live animal produced its periodic yield into its own inventory.
 */
export const animalProducedEvent = "animal.product.ready";

/**
 * Why an animal left the world; the value is the `cause` of `animal.died`.
 */
export enum AnimalDeathCause {
  Butchered = "butchered",
  Hunted = "hunted",
  Predation = "predation",
  Stolen = "stolen",
}

/**
 * Payload of `animal.died`.
 */
export type AnimalDied = {
  entityId: EntityId;
  prototypeId: string;
  cause: string;
};

/**
 * Payload of `animal.product.ready`.
 */
export type AnimalProduced = {
  entityId: EntityId;
  prototypeId: string;
};
