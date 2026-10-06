import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { NodeStatus } from "../behavior/behaviorTypes";
import type { BehaviorContext } from "../behavior/behaviorTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { removeAnimal, damageHealth } from "../fauna/animalLifecycle";
import { isPredator, senseNearest } from "../fauna/animalSenses";
import type { SensedEntity } from "../fauna/animalSenses";
import { AnimalDeathCause, contactCost } from "../fauna/faunaTypes";
import { positionComponent } from "../map/positionComponent";

/**
 * Condition: a predator animal is within `guardDetectionCost` of the guard.
 */
export const hostileAnimalNearId = "hostile_animal_near";

/**
 * Action: walk to the nearest predator and strike it once within reach.
 */
export const engageThreatId = "engage_threat";

/**
 * Path cost within which a guard notices a predator (about 8 cells of normal terrain).
 */
export const guardDetectionCost = 80;

/**
 * Task priority of a guard engaging a threat: above a claimed job (50), below a need (100).
 */
export const engagePriority = 55;

/**
 * Health a guard's strike takes off a predator, milli-percent.
 */
export const guardStrikeMilli = 34_000;

function nearestPredator(engine: GameEngine, context: BehaviorContext): SensedEntity | null {
  return senseNearest(engine, context.entity, guardDetectionCost, (other) =>
    isPredator(engine, other),
  );
}

/**
 * The condition `hostile_animal_near` (spec 022 `guard_patrol` threat response).
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when a predator is within detection range.
 */
export function hostileAnimalNear(engine: GameEngine, context: BehaviorContext): NodeStatus {
  return nearestPredator(engine, context) === null ? NodeStatus.Failure : NodeStatus.Success;
}

/**
 * The action `engage_threat`: walks to the predator (task priority {@link engagePriority}); within
 * `contactCost` the guard strikes it for {@link guardStrikeMilli} of its health and a predator at
 * zero health is removed (`animal.died`, cause `hunted`, no drops). Combat beyond this does not
 * exist yet (DECISIONS D-140).
 *
 * @param engine - The engine.
 * @param context - Behavior context.
 * @returns Success when a predator is in range, failure otherwise.
 */
export function engageThreat(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const threat = nearestPredator(engine, context);
  const position = getComponent(context.entity, positionComponent);
  if (threat === null || position === undefined) {
    return NodeStatus.Failure;
  }
  if (threat.cost <= contactCost) {
    if (damageHealth(threat.entity, guardStrikeMilli, 0) === 0) {
      removeAnimal(engine, threat.entity, AnimalDeathCause.Hunted);
    }
  } else {
    engine.tasks.enqueue(context.entityId, {
      type: AiTaskType.Move,
      data: moveTaskData(position.mapId, threat.cell),
      priority: engagePriority,
    });
  }
  return NodeStatus.Success;
}

/**
 * Registers `hostile_animal_near` and `engage_threat` with the engine's behavior handler registry.
 *
 * @param engine - The engine; call before the first `newGame` / `loadGame`.
 */
export function registerGuardHandlers(engine: GameEngine): void {
  engine.behaviorHandlers.registerCondition(hostileAnimalNearId, (context) =>
    hostileAnimalNear(engine, context),
  );
  engine.behaviorHandlers.registerAction(engageThreatId, (context) =>
    engageThreat(engine, context),
  );
}
