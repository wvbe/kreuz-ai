import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { moveSpeedOf } from "../ai/movement/movementSpeed";
import { PathResultKind } from "../pathfinding/pathTypes";
import { getAiService } from "../ai/aiServiceRegistry";
import type { TaskRecord } from "../task/taskTypes";
import { CrierStatus, deliverTaskType } from "./crierTypes";
import { townCrierComponent } from "./townCrierComponent";

/**
 * All Town Crier entities (the fleet), ascending by id; entities waiting for deletion are left
 * out.
 *
 * @param engine - The engine that owns the entities.
 * @returns Live entities that carry `TownCrier`.
 */
export function listCriers(engine: GameEngine): Entity[] {
  return engine.store
    .entities()
    .filter(
      (entity) =>
        getComponent(entity, townCrierComponent) !== undefined &&
        !engine.store.isPendingDelete(entity.id),
    );
}

/**
 * The criers that can take a delivery now: status `Available` and standing on a map.
 *
 * @param engine - The engine.
 * @returns The free criers, ascending by id.
 */
export function availableCriers(engine: GameEngine): Entity[] {
  return listCriers(engine).filter(
    (entity) =>
      getComponent(entity, townCrierComponent)?.status === CrierStatus.Available &&
      getComponent(entity, positionComponent) !== undefined,
  );
}

/**
 * The unfinished delivery task of a crier, if it has one.
 *
 * @param engine - The engine.
 * @param crierId - Crier entity id.
 * @returns The pending, running or waiting `towncrier.deliver` record, or undefined.
 */
export function deliverTaskOf(engine: GameEngine, crierId: EntityId): TaskRecord | undefined {
  return engine.tasks.getQueue(crierId)?.tasks.find((task) => task.type === deliverTaskType);
}

/**
 * How far a crier is from a board: the path cost from its cell to the board's cell and the ticks
 * the walk takes at its movement speed (10 progress per tick covers a cost of 10).
 */
export type CrierTrip = {
  cost: number;
  ticks: number;
};

/**
 * Plans the walk of a crier to a board.
 *
 * @param engine - The engine.
 * @param crier - The crier entity.
 * @param boardId - Target board entity id.
 * @returns The trip, or null when the crier or the board has no position, they are on different
 * maps or no path exists.
 */
export function tripToBoard(
  engine: GameEngine,
  crier: Entity,
  boardId: EntityId,
): CrierTrip | null {
  const from = getComponent(crier, positionComponent);
  const board = engine.store.get(boardId);
  const goal = board === undefined ? undefined : getComponent(board, positionComponent);
  if (from === undefined || goal === undefined || from.mapId !== goal.mapId) {
    return null;
  }
  const result = getAiService(engine).pathfinding.findPath(
    from.mapId,
    from.cellIndex,
    goal.cellIndex,
  );
  if (result.kind === PathResultKind.NoPath) {
    return null;
  }
  const cost = result.kind === PathResultKind.Found ? result.cost : 0;
  const speed = moveSpeedOf(engine.content, crier);
  return { cost, ticks: Math.ceil(cost / speed) };
}
