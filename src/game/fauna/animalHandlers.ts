import { NodeStatus } from "../behavior/behaviorTypes";
import type { BehaviorContext } from "../behavior/behaviorTypes";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { animalComponent } from "./animalComponent";
import {
  animalContentOf,
  isGuard,
  isHumanoid,
  isPreyOf,
  matchesSense,
  senseNearest,
} from "./animalSenses";
import type { SensedEntity } from "./animalSenses";
import { canAttack, damageHealth, removeAnimal, startAttackCooldown } from "./animalLifecycle";
import {
  enqueueMove,
  fleeAnimal,
  grazeAnimal,
  hasTaskAtLeast,
  wanderAnimal,
} from "./animalMovement";
import {
  animalHungryMilli,
  AnimalDeathCause,
  attackDamageMilli,
  contactCost,
  FaunaStream,
  FaunaTaskPriority,
  humanoidAttackDamageMilli,
  humanoidHealthFloorMilli,
  predatorHuntChance,
  SenseKind,
} from "./faunaTypes";

/**
 * Condition: the animal is hungry (hunger at or above `animalHungryMilli`).
 */
export const animalHungryId = "animal_hungry";

/**
 * Condition: a threat is within the flee radius of the animal. Param `from` is `humanoid` (the
 * default, wild prey) or `predator` (livestock).
 */
export const threatNearId = "threat_near";

/**
 * Condition: a humanoid is within the detection radius of the animal (its territory).
 */
export const humanoidNearId = "humanoid_near";

/**
 * Condition: a prey animal of the predator is within its detection radius.
 */
export const preyNearId = "prey_near";

/**
 * Condition: no guard or soldier is within the detection radius of the animal.
 */
export const noGuardNearId = "no_guard_near";

/**
 * Condition: the animal is aggressive (its record says so).
 */
export const animalAggressiveId = "animal_aggressive";

/**
 * Condition: the per-decision roll that a predator that sees prey goes for it
 * (`predatorHuntChance`, stream `fauna.hunt`).
 */
export const huntUrgeId = "hunt_urge";

/**
 * Action: run away from the nearest threat (param `from` like {@link threatNearId}).
 */
export const fleeFromThreatId = "flee_from_threat";

/**
 * Action: walk to food and eat there.
 */
export const grazeId = "graze";

/**
 * Action: stand around or stroll over the animal's terrain.
 */
export const wanderAnimalId = "wander_animal";

/**
 * Action: walk towards the nearest prey.
 */
export const stalkPreyId = "stalk_prey";

/**
 * Action: hurt the prey when it is within reach (and the cooldown is over).
 */
export const attackPreyId = "attack_prey";

/**
 * Action: the fox takes a chicken that is within reach (the chicken leaves the world).
 */
export const stealPreyId = "steal_prey";

/**
 * Action: walk to a humanoid and hurt it (never below a floor).
 */
export const attackIntruderId = "attack_intruder";

function senseKindOf(context: BehaviorContext): SenseKind {
  return context.params["from"] === SenseKind.Predator ? SenseKind.Predator : SenseKind.Humanoid;
}

function threatOf(engine: GameEngine, context: BehaviorContext): SensedEntity | null {
  const content = animalContentOf(engine, context.entity);
  const kind = senseKindOf(context);
  return content === undefined
    ? null
    : senseNearest(engine, context.entity, content.fleeRadiusCost, (other) =>
        matchesSense(engine, kind, other),
      );
}

function nearestPrey(engine: GameEngine, entity: Entity): SensedEntity | null {
  const content = animalContentOf(engine, entity);
  return content === undefined
    ? null
    : senseNearest(engine, entity, content.detectionRadiusCost, (other) =>
        isPreyOf(engine, entity, other),
      );
}

function status(value: boolean): NodeStatus {
  return value ? NodeStatus.Success : NodeStatus.Failure;
}

/**
 * Whether the animal is hungry.
 *
 * @param context - Behavior context.
 * @returns Success when hunger is at or above the threshold.
 */
export function animalHungry(context: BehaviorContext): NodeStatus {
  return status(
    (getComponent(context.entity, animalComponent)?.hungerMilli ?? 0) >= animalHungryMilli,
  );
}

/**
 * Whether a threat is within the flee radius.
 *
 * @param engine - The engine.
 * @param context - Behavior context (param `from`).
 * @returns Success when one is.
 */
export function threatNear(engine: GameEngine, context: BehaviorContext): NodeStatus {
  return status(threatOf(engine, context) !== null);
}

/**
 * Whether a humanoid is within the detection radius.
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when one is.
 */
export function humanoidNear(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const content = animalContentOf(engine, context.entity);
  return status(
    content !== undefined &&
      senseNearest(engine, context.entity, content.detectionRadiusCost, isHumanoid) !== null,
  );
}

/**
 * Whether prey is within the detection radius.
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when some is.
 */
export function preyNear(engine: GameEngine, context: BehaviorContext): NodeStatus {
  return status(nearestPrey(engine, context.entity) !== null);
}

/**
 * Whether no guard is within the detection radius.
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when none is.
 */
export function noGuardNear(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const content = animalContentOf(engine, context.entity);
  return status(
    content === undefined ||
      senseNearest(engine, context.entity, content.detectionRadiusCost, isGuard) === null,
  );
}

/**
 * Whether the animal is aggressive.
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success for aggressive records.
 */
export function animalAggressive(engine: GameEngine, context: BehaviorContext): NodeStatus {
  return status(animalContentOf(engine, context.entity)?.aggressive === true);
}

/**
 * The hunt roll: success with `predatorHuntChance` per mille, drawn from `fauna.hunt`.
 *
 * @param engine - The engine.
 * @returns Success when the predator goes for its prey.
 */
export function huntUrge(engine: GameEngine): NodeStatus {
  return status(engine.prng.stream(FaunaStream.Hunt).chancePermille(predatorHuntChance));
}

/**
 * Runs away from the nearest threat.
 *
 * @param engine - The engine.
 * @param context - Behavior context (param `from`).
 * @returns Success when a run was started, failure when there is no threat or nowhere to go.
 */
export function fleeFromThreat(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const threat = threatOf(engine, context);
  return status(threat !== null && fleeAnimal(engine, context.entity, threat.cell));
}

/**
 * Walks to food (or eats where it stands).
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when a task was enqueued.
 */
export function graze(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const content = animalContentOf(engine, context.entity);
  return status(content !== undefined && grazeAnimal(engine, context.entity, content));
}

/**
 * Stands around or strolls.
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success.
 */
export function wanderAnimalAction(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const content = animalContentOf(engine, context.entity);
  if (content !== undefined) {
    wanderAnimal(engine, context.entity, content);
  }
  return NodeStatus.Success;
}

function approach(engine: GameEngine, entity: Entity, target: SensedEntity): void {
  if (target.cost > contactCost && !hasTaskAtLeast(entity, FaunaTaskPriority.Stalk)) {
    enqueueMove(engine, entity, target.cell, FaunaTaskPriority.Stalk);
  }
}

/**
 * Walks towards the nearest prey (nothing to do when it is already within reach).
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when there is prey, failure otherwise.
 */
export function stalkPrey(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const prey = nearestPrey(engine, context.entity);
  if (prey === null) {
    return NodeStatus.Failure;
  }
  approach(engine, context.entity, prey);
  return NodeStatus.Success;
}

/**
 * Hurts the nearest prey when it is within reach: `attackDamageMilli` of its health, then the
 * attack cooldown. A prey that reaches zero health is removed (`animal.died`, cause `predation`).
 * Prey that is still too far away is only stalked, so this returns success either way.
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when there is prey, failure otherwise.
 */
export function attackPrey(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const prey = nearestPrey(engine, context.entity);
  if (prey === null) {
    return NodeStatus.Failure;
  }
  if (prey.cost <= contactCost && canAttack(context.entity, context.tick)) {
    startAttackCooldown(context.entity, context.tick);
    if (damageHealth(prey.entity, attackDamageMilli, 0) === 0) {
      removeAnimal(engine, prey.entity, AnimalDeathCause.Predation);
    }
  }
  return NodeStatus.Success;
}

/**
 * The fox takes prey that is within reach: the prey is removed at once (spec 022 US11 scenario 5).
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when there is prey, failure otherwise.
 */
export function stealPrey(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const prey = nearestPrey(engine, context.entity);
  if (prey === null) {
    return NodeStatus.Failure;
  }
  if (prey.cost <= contactCost) {
    removeAnimal(engine, prey.entity, AnimalDeathCause.Stolen);
  }
  return NodeStatus.Success;
}

/**
 * Walks to the nearest humanoid and, once within reach, hurts it by `humanoidAttackDamageMilli`
 * (never below `humanoidHealthFloorMilli`: there is no combat system, so an attack cannot kill).
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when a humanoid is in range, failure otherwise.
 */
export function attackIntruder(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const content = animalContentOf(engine, context.entity);
  const target =
    content === undefined
      ? null
      : senseNearest(engine, context.entity, content.detectionRadiusCost, isHumanoid);
  if (target === null || getComponent(context.entity, positionComponent) === undefined) {
    return NodeStatus.Failure;
  }
  if (target.cost <= contactCost) {
    if (canAttack(context.entity, context.tick)) {
      startAttackCooldown(context.entity, context.tick);
      damageHealth(target.entity, humanoidAttackDamageMilli, humanoidHealthFloorMilli);
    }
  } else {
    approach(engine, context.entity, target);
  }
  return NodeStatus.Success;
}

/**
 * Registers the conditions and actions of the animal behavior trees with the engine's behavior
 * handler registry.
 *
 * @param engine - The engine; call before the first `newGame` / `loadGame`.
 */
export function registerAnimalHandlers(engine: GameEngine): void {
  const handlers = engine.behaviorHandlers;
  handlers.registerCondition(animalHungryId, (context) => animalHungry(context));
  handlers.registerCondition(threatNearId, (context) => threatNear(engine, context));
  handlers.registerCondition(humanoidNearId, (context) => humanoidNear(engine, context));
  handlers.registerCondition(preyNearId, (context) => preyNear(engine, context));
  handlers.registerCondition(noGuardNearId, (context) => noGuardNear(engine, context));
  handlers.registerCondition(animalAggressiveId, (context) => animalAggressive(engine, context));
  handlers.registerCondition(huntUrgeId, () => huntUrge(engine));
  handlers.registerAction(fleeFromThreatId, (context) => fleeFromThreat(engine, context));
  handlers.registerAction(grazeId, (context) => graze(engine, context));
  handlers.registerAction(wanderAnimalId, (context) => wanderAnimalAction(engine, context));
  handlers.registerAction(stalkPreyId, (context) => stalkPrey(engine, context));
  handlers.registerAction(attackPreyId, (context) => attackPrey(engine, context));
  handlers.registerAction(stealPreyId, (context) => stealPrey(engine, context));
  handlers.registerAction(attackIntruderId, (context) => attackIntruder(engine, context));
}
