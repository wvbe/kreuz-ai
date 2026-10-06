import { getAiService } from "../ai/aiServiceRegistry";
import type { AnimalPrototypeContent } from "../content/schemas/characterSchemas";
import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { positionComponent } from "../map/positionComponent";
import { animalComponent } from "./animalComponent";
import { guardPrototypeIds, predatorThreatLevel, SenseKind } from "./faunaTypes";

/**
 * An entity an animal noticed: how far away (path cost) and where.
 */
export type SensedEntity = {
  entity: Entity;
  cost: number;
  cell: number;
};

/**
 * The content record of an animal entity.
 *
 * @param engine - The engine with its content.
 * @param entity - Any entity.
 * @returns The animal prototype record, or undefined when the entity is no animal.
 */
export function animalContentOf(
  engine: GameEngine,
  entity: Entity,
): AnimalPrototypeContent | undefined {
  const animal = getComponent(entity, animalComponent);
  return animal === undefined ? undefined : engine.content.animals.find(animal.prototypeId);
}

/**
 * Whether an entity is a settler-like humanoid standing on a map (it has `Citizen` and a
 * `Position`).
 *
 * @param entity - Any entity.
 * @returns True for humanoids.
 */
export function isHumanoid(entity: Entity): boolean {
  return hasComponent(entity, citizenComponent) && hasComponent(entity, positionComponent);
}

/**
 * Whether an entity is a guard or soldier, the presence of which keeps predators away.
 *
 * @param entity - Any entity.
 * @returns True for the guard prototypes.
 */
export function isGuard(entity: Entity): boolean {
  return isHumanoid(entity) && guardPrototypeIds.includes(entity.prototype);
}

/**
 * Whether an entity is a predator animal (threat level at least `predatorThreatLevel`).
 *
 * @param engine - The engine with its content.
 * @param entity - Any entity.
 * @returns True for wolves, boars, bears.
 */
export function isPredator(engine: GameEngine, entity: Entity): boolean {
  return (animalContentOf(engine, entity)?.threatLevel ?? 0) >= predatorThreatLevel;
}

/**
 * Whether `other` is prey of `self` (its prototype is in the predator's `preyIds`).
 *
 * @param engine - The engine with its content.
 * @param self - The hunting animal.
 * @param other - The candidate.
 * @returns True when `other` is an animal of a prey prototype.
 */
export function isPreyOf(engine: GameEngine, self: Entity, other: Entity): boolean {
  const content = animalContentOf(engine, self);
  const animal = getComponent(other, animalComponent);
  return (
    content !== undefined && animal !== undefined && content.preyIds.includes(animal.prototypeId)
  );
}

/**
 * Whether an entity matches a sense kind from the point of view of an animal.
 *
 * @param engine - The engine with its content.
 * @param kind - What to look for.
 * @param entity - The candidate.
 * @returns True for a match.
 */
export function matchesSense(engine: GameEngine, kind: SenseKind, entity: Entity): boolean {
  return kind === SenseKind.Humanoid ? isHumanoid(entity) : isPredator(engine, entity);
}

/**
 * Finds the nearest entity that satisfies `accept` within a path-cost radius of the animal: the
 * cells reachable within the radius are scanned by ascending cost (ties: lowest cell) and the
 * occupants of each by ascending id, so the answer is a pure function of the world state. The
 * animal itself and entities flagged for deletion are skipped.
 *
 * @param engine - The engine (pathfinding and occupants).
 * @param self - The sensing animal; without a `Position` nothing is sensed.
 * @param radiusCost - Largest path cost to look at; 0 senses nothing.
 * @param accept - Filter over the candidate entity.
 * @returns The nearest accepted entity, or null.
 */
export function senseNearest(
  engine: GameEngine,
  self: Entity,
  radiusCost: number,
  accept: (entity: Entity) => boolean,
): SensedEntity | null {
  const position = getComponent(self, positionComponent);
  if (position === undefined || radiusCost <= 0) {
    return null;
  }
  const cells = getAiService(engine)
    .pathfinding.reachable(position.mapId, position.cellIndex, radiusCost)
    .sort((left, right) =>
      left.cost === right.cost ? left.cell - right.cell : left.cost - right.cost,
    );
  for (const reachable of cells) {
    for (const id of engine.maps.occupants.occupantsOf(position.mapId, reachable.cell)) {
      const entity = engine.store.get(id);
      if (
        entity !== undefined &&
        entity.id !== self.id &&
        !engine.store.isPendingDelete(id) &&
        accept(entity)
      ) {
        return { entity, cost: reachable.cost, cell: reachable.cell };
      }
    }
  }
  return null;
}
