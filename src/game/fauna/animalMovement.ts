import { getAiService } from "../ai/aiServiceRegistry";
import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { idleTaskData } from "../ai/tasks/idleTask";
import type { AnimalPrototypeContent } from "../content/schemas/characterSchemas";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { activeZonesOfType } from "../zones/zoneQueries";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { distanceSquared } from "../worldgen/distanceSquared";
import {
  animalStandChance,
  animalStandMaxTicks,
  animalStandMinTicks,
  animalWanderRadiusCost,
  fleeDistanceCost,
  fleeFreezeTicks,
  FaunaStream,
  FaunaTaskPriority,
  grazeStandTicks,
} from "./faunaTypes";
import { taskQueueComponent } from "../task/taskQueueComponent";

/**
 * Cells within a path-cost radius of an animal with their costs, ascending by cost then cell.
 *
 * @param engine - The engine.
 * @param entity - The animal.
 * @param radiusCost - Path cost bound.
 * @returns Reachable cells (including its own, cost 0), or empty without a position.
 */
export function cellsAround(
  engine: GameEngine,
  entity: Entity,
  radiusCost: number,
): { cell: number; cost: number }[] {
  const position = getComponent(entity, positionComponent);
  return position === undefined
    ? []
    : [
        ...getAiService(engine).pathfinding.reachable(
          position.mapId,
          position.cellIndex,
          radiusCost,
        ),
      ].sort((left, right) =>
        left.cost === right.cost ? left.cell - right.cell : left.cost - right.cost,
      );
}

/**
 * The terrains an animal may wander over: its habitat and its diet. An animal with neither (a
 * record without terrain) may walk anywhere reachable.
 *
 * @param content - The animal record.
 * @returns Terrain ids; empty means "no restriction".
 */
export function roamTerrainOf(content: AnimalPrototypeContent): readonly string[] {
  return [...content.habitatTerrainIds, ...content.dietTerrainIds];
}

/**
 * Whether the animal has any task at or above a priority.
 *
 * @param entity - The animal.
 * @param priority - The priority to compare with.
 * @returns True when such a task is queued.
 */
export function hasTaskAtLeast(entity: Entity, priority: number): boolean {
  return (getComponent(entity, taskQueueComponent)?.tasks ?? []).some(
    (task) => task.priority >= priority,
  );
}

/**
 * Enqueues "walk to a cell" for an animal.
 *
 * @param engine - The engine.
 * @param entity - The animal; it must have a `Position`.
 * @param cell - Target cell on its map.
 * @param priority - Task priority.
 */
export function enqueueMove(
  engine: GameEngine,
  entity: Entity,
  cell: number,
  priority: number,
): void {
  const position = getComponent(entity, positionComponent);
  if (position !== undefined) {
    engine.tasks.enqueue(entity.id, {
      type: AiTaskType.Move,
      data: moveTaskData(position.mapId, cell),
      priority,
    });
  }
}

/**
 * Enqueues "stand still" for an animal.
 *
 * @param engine - The engine.
 * @param entity - The animal.
 * @param ticks - How long, at least 1.
 * @param priority - Task priority.
 */
export function enqueueStand(
  engine: GameEngine,
  entity: Entity,
  ticks: number,
  priority: number,
): void {
  engine.tasks.enqueue(entity.id, {
    type: AiTaskType.Idle,
    data: idleTaskData(ticks),
    priority,
  });
}

/**
 * The cells of the active zones of the animal's own zone type (the pasture of a livestock animal)
 * on its map.
 *
 * @param engine - The engine.
 * @param entity - The animal.
 * @param content - Its record.
 * @returns The zone cells, or null when the record names no zone or no such zone is active.
 */
export function penTilesOf(
  engine: GameEngine,
  entity: Entity,
  content: AnimalPrototypeContent,
): ReadonlySet<number> | null {
  const position = getComponent(entity, positionComponent);
  if (position === undefined || content.zoneId === undefined) {
    return null;
  }
  const tiles = new Set<number>();
  for (const zoneId of activeZonesOfType(engine, content.zoneId)) {
    const zone = getZoneService(engine).getZone(zoneId);
    if (zone !== null && zone.data.mapId === position.mapId) {
      for (const tile of zone.data.tiles) {
        tiles.add(tile);
      }
    }
  }
  return tiles.size === 0 ? null : tiles;
}

/**
 * Whether the animal has a pen (an active zone of its type) and stands outside it.
 *
 * @param engine - The engine.
 * @param entity - The animal.
 * @param content - Its record.
 * @returns True when it should go back.
 */
export function isOutsidePen(
  engine: GameEngine,
  entity: Entity,
  content: AnimalPrototypeContent,
): boolean {
  const pen = penTilesOf(engine, entity, content);
  const position = getComponent(entity, positionComponent);
  return pen !== null && position !== undefined && !pen.has(position.cellIndex);
}

/**
 * Sends an animal that stands outside its pen to the nearest cell of the pen (by path cost, ties
 * lowest cell) at idle priority.
 *
 * @param engine - The engine.
 * @param entity - The animal.
 * @param content - Its record.
 * @returns False when it has no pen, is inside it already, or cannot reach it.
 */
export function returnToPen(
  engine: GameEngine,
  entity: Entity,
  content: AnimalPrototypeContent,
): boolean {
  const pen = penTilesOf(engine, entity, content);
  const position = getComponent(entity, positionComponent);
  if (pen === null || position === undefined || pen.has(position.cellIndex)) {
    return false;
  }
  const nearest = getAiService(engine)
    .pathfinding.reachable(position.mapId, position.cellIndex)
    .filter((reachable) => pen.has(reachable.cell))
    .sort((left, right) =>
      left.cost === right.cost ? left.cell - right.cell : left.cost - right.cost,
    )[0];
  if (nearest === undefined) {
    return false;
  }
  enqueueMove(engine, entity, nearest.cell, 10);
  return true;
}

/**
 * Makes an idle animal stand around or walk to a nearby cell of its terrain (the fauna version of
 * `idle_wander`, drawing only from `fauna.move`). It does nothing while the animal already has a
 * task. An animal inside its pen stays inside it.
 *
 * @param engine - The engine.
 * @param entity - The animal.
 * @param content - Its record.
 */
export function wanderAnimal(
  engine: GameEngine,
  entity: Entity,
  content: AnimalPrototypeContent,
): void {
  if (hasTaskAtLeast(entity, 0)) {
    return;
  }
  const stream = engine.prng.stream(FaunaStream.Move);
  const stand = stream.chancePermille(animalStandChance);
  const ticks = stream.nextInt(animalStandMinTicks, animalStandMaxTicks);
  const allowed = roamTerrainOf(content);
  const map = engine.maps.get(getComponent(entity, positionComponent)?.mapId ?? 0);
  const own = getComponent(entity, positionComponent)?.cellIndex;
  const pen = penTilesOf(engine, entity, content);
  const inPen = pen !== null && own !== undefined && pen.has(own);
  const options =
    stand || map === undefined
      ? []
      : cellsAround(engine, entity, animalWanderRadiusCost).filter(
          (reachable) =>
            reachable.cell !== own &&
            (!inPen || pen.has(reachable.cell)) &&
            (allowed.length === 0 || allowed.includes(map.terrainAt(reachable.cell))),
        );
  if (options.length === 0) {
    enqueueStand(engine, entity, ticks, 10);
  } else {
    enqueueMove(engine, entity, stream.choice(options).cell, 10);
  }
}

/**
 * Sends a hungry animal to food: it stands and eats where it is when the terrain under it is in
 * its diet, otherwise it walks to one of the three nearest diet cells (`fauna.move` picks); in its
 * pen it only eats inside the pen.
 *
 * @param engine - The engine.
 * @param entity - The animal.
 * @param content - Its record.
 * @returns False when there is no diet cell within reach.
 */
export function grazeAnimal(
  engine: GameEngine,
  entity: Entity,
  content: AnimalPrototypeContent,
): boolean {
  const position = getComponent(entity, positionComponent);
  const map = position === undefined ? undefined : engine.maps.get(position.mapId);
  if (position === undefined || map === undefined || content.dietTerrainIds.length === 0) {
    return false;
  }
  if (content.dietTerrainIds.includes(map.terrainAt(position.cellIndex))) {
    enqueueStand(engine, entity, grazeStandTicks, 10);
    return true;
  }
  const pen = penTilesOf(engine, entity, content);
  const inPen = pen !== null && pen.has(position.cellIndex);
  const food = cellsAround(engine, entity, animalWanderRadiusCost)
    .filter(
      (reachable) =>
        content.dietTerrainIds.includes(map.terrainAt(reachable.cell)) &&
        (!inPen || pen.has(reachable.cell)),
    )
    .slice(0, 3);
  if (food.length === 0) {
    return false;
  }
  enqueueMove(engine, entity, engine.prng.stream(FaunaStream.Move).choice(food).cell, 10);
  return true;
}

/**
 * Picks the cell a fleeing animal runs to: among the cells within {@link fleeDistanceCost} the one
 * farthest from the threat (squared centroid distance, ties lowest cell).
 *
 * @param engine - The engine.
 * @param entity - The fleeing animal.
 * @param threat - Cell the threat stands on.
 * @returns The cell, or null when the animal cannot move.
 */
export function pickFleeCell(engine: GameEngine, entity: Entity, threat: number): number | null {
  const position = getComponent(entity, positionComponent);
  const map = position === undefined ? undefined : engine.maps.get(position.mapId);
  if (position === undefined || map === undefined) {
    return null;
  }
  const origin = map.centroid(threat);
  let best: number | null = null;
  let bestDistance = distanceSquared(map.centroid(position.cellIndex), origin);
  for (const reachable of cellsAround(engine, entity, fleeDistanceCost)) {
    const distance = distanceSquared(map.centroid(reachable.cell), origin);
    if (
      distance > bestDistance ||
      (distance === bestDistance && best !== null && reachable.cell < best)
    ) {
      best = reachable.cell;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Makes an animal run from a cell: a run at flee priority and then a short freeze, so a hunter
 * who follows can catch up (DECISIONS D-140).
 *
 * @param engine - The engine.
 * @param entity - The fleeing animal.
 * @param threat - Cell of the threat.
 * @returns False when no cell farther away exists (the animal stays).
 */
export function fleeAnimal(engine: GameEngine, entity: Entity, threat: number): boolean {
  const target = pickFleeCell(engine, entity, threat);
  if (target === null) {
    return false;
  }
  enqueueMove(engine, entity, target, FaunaTaskPriority.Flee);
  enqueueStand(engine, entity, fleeFreezeTicks, FaunaTaskPriority.Flee);
  return true;
}
