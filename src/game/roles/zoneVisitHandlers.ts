import { getAiService } from "../ai/aiServiceRegistry";
import { AiTaskPriority, AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { idleTaskData } from "../ai/tasks/idleTask";
import { NodeStatus } from "../behavior/behaviorTypes";
import type { BehaviorContext } from "../behavior/behaviorTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { activeZonesOfType } from "../zones/zoneQueries";
import { getZoneService } from "../zones/zoneServiceRegistry";

/**
 * Condition: at least one active zone of one of the named types exists on the entity's map. The
 * param `zoneTypes` is a comma separated list of zone type ids.
 */
export const zoneAvailableId = "zone_available";

/**
 * Action: walk to the nearest cell of an active zone of the named types and stand there for a
 * while (the merchant at the market, the priest at the chapel). Same `zoneTypes` param.
 */
export const goToZoneId = "go_to_zone";

/**
 * How long an entity that stands in its zone waits before it decides again, ticks.
 */
export const zoneStandTicks = 24;

function zoneTiles(engine: GameEngine, mapId: number, context: BehaviorContext): number[] {
  const wanted = String(context.params["zoneTypes"] ?? "")
    .split(",")
    .filter((id) => id.length > 0);
  const tiles: number[] = [];
  for (const typeId of wanted) {
    for (const zoneId of activeZonesOfType(engine, typeId)) {
      const zone = getZoneService(engine).getZone(zoneId);
      if (zone !== null && zone.data.mapId === mapId) {
        tiles.push(...zone.data.tiles);
      }
    }
  }
  return tiles;
}

/**
 * The condition `zone_available`.
 *
 * @param engine - The engine.
 * @param context - Behavior context (param `zoneTypes`).
 * @returns Success when an active zone of a named type with tiles is on the entity's map.
 */
export function zoneAvailable(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const position = getComponent(context.entity, positionComponent);
  return position !== undefined && zoneTiles(engine, position.mapId, context).length > 0
    ? NodeStatus.Success
    : NodeStatus.Failure;
}

/**
 * The action `go_to_zone`: when the entity already stands in such a zone it stands still for
 * {@link zoneStandTicks}, otherwise it walks to the nearest zone cell (by path cost, ties lowest
 * cell). Everything is enqueued at idle priority, so any need or job interrupts it. It does
 * nothing while the entity has a task.
 *
 * @param engine - The engine.
 * @param context - Behavior context (param `zoneTypes`).
 * @returns Success when a task was enqueued or one is already running, failure when no zone cell
 * can be reached.
 */
export function goToZone(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const position = getComponent(context.entity, positionComponent);
  const queue = getComponent(context.entity, taskQueueComponent);
  if (position === undefined || queue === undefined) {
    return NodeStatus.Failure;
  }
  if (queue.tasks.length > 0) {
    return NodeStatus.Success;
  }
  const tiles = new Set(zoneTiles(engine, position.mapId, context));
  if (tiles.has(position.cellIndex)) {
    engine.tasks.enqueue(context.entityId, {
      type: AiTaskType.Idle,
      data: idleTaskData(zoneStandTicks),
      priority: AiTaskPriority.Idle,
    });
    return NodeStatus.Success;
  }
  const best = getAiService(engine)
    .pathfinding.reachable(position.mapId, position.cellIndex)
    .filter((reachable) => tiles.has(reachable.cell))
    .sort((left, right) =>
      left.cost === right.cost ? left.cell - right.cell : left.cost - right.cost,
    )[0];
  if (best === undefined) {
    return NodeStatus.Failure;
  }
  engine.tasks.enqueue(context.entityId, {
    type: AiTaskType.Move,
    data: moveTaskData(position.mapId, best.cell),
    priority: AiTaskPriority.Idle,
  });
  return NodeStatus.Success;
}

/**
 * Registers `zone_available` and `go_to_zone` with the engine's behavior handler registry.
 *
 * @param engine - The engine; call before the first `newGame` / `loadGame`.
 */
export function registerZoneVisitHandlers(engine: GameEngine): void {
  engine.behaviorHandlers.registerCondition(zoneAvailableId, (context) =>
    zoneAvailable(engine, context),
  );
  engine.behaviorHandlers.registerAction(goToZoneId, (context) => goToZone(engine, context));
}
