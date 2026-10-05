import { z } from "zod";
import { getComponent } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import type { JsonValue } from "../../engine/EventBus";
import { positionComponent } from "../../map/positionComponent";
import { PathResultKind } from "../../pathfinding/pathTypes";
import { continueStep, doneStep, failStep } from "../../task/stepResults";
import type { StepResult, TaskContext, TaskHandler, TaskRecord } from "../../task/taskTypes";
import { getAiService } from "../aiServiceRegistry";
import { AiTaskType, movementCompletedEvent, movementStartedEvent } from "../aiTypes";
import { moveSpeedOf } from "./movementSpeed";

/**
 * How often one move re-plans around a blocked cell before it fails with `blocked`.
 */
export const maxRepaths = 3;

/**
 * Failure reason when no path exists to the target.
 */
export const unreachableReason = "unreachable";

/**
 * Failure reason when the path kept getting blocked.
 */
export const blockedReason = "blocked";

const moveDataSchema = z
  .object({
    mapId: z.number().int().min(1),
    target: z.number().int().min(0),
    path: z.array(z.number().int().min(0)),
    progress: z.number().int().min(0),
    repaths: z.number().int().min(0),
    started: z.boolean(),
  })
  .strict();

type MoveData = z.infer<typeof moveDataSchema>;

const moveRequestSchema = z
  .object({ mapId: z.number().int().min(1), target: z.number().int().min(0) })
  .strict();

/**
 * Data to enqueue a `move` task: the map and the cell to walk to (on the entity's own map; routes
 * across map links are not followed yet).
 *
 * @param mapId - Map of the target.
 * @param target - Target cell index.
 * @returns JSON for `TaskSystem.enqueue`.
 */
export function moveTaskData(mapId: number, target: number): JsonValue {
  return { mapId, target };
}

function plan(engine: GameEngine, data: MoveData, from: number): boolean {
  const result = getAiService(engine).pathfinding.findPath(data.mapId, from, data.target);
  if (result.kind === PathResultKind.NoPath) {
    return false;
  }
  data.path = result.kind === PathResultKind.Found ? result.cells : [];
  return true;
}

function advance(engine: GameEngine, context: TaskContext, data: MoveData): StepResult {
  const position = getComponent(context.entity, positionComponent);
  if (position === undefined || position.mapId !== data.mapId) {
    return failStep(unreachableReason);
  }
  const map = engine.maps.require(data.mapId);
  data.progress += moveSpeedOf(engine.content, context.entity);
  while (data.path.length > 0) {
    const next = data.path[0] as number;
    if (!map.isTraversable(next)) {
      data.repaths += 1;
      if (data.repaths > maxRepaths) {
        return failStep(blockedReason);
      }
      if (!plan(engine, data, position.cellIndex)) {
        return failStep(unreachableReason);
      }
      continue;
    }
    const cost = map.moveCost(next);
    if (data.progress < cost) {
      break;
    }
    data.progress -= cost;
    if (!data.started) {
      data.started = true;
      engine.bus.emit(movementStartedEvent, {
        entityId: context.entityId,
        mapId: data.mapId,
        fromCell: position.cellIndex,
        toCell: next,
      });
    }
    engine.maps.moveEntity(context.entityId, next);
    position.cellIndex = next;
    data.path.shift();
  }
  context.task.data = data;
  if (data.path.length > 0) {
    return continueStep();
  }
  engine.bus.emit(movementCompletedEvent, {
    entityId: context.entityId,
    mapId: data.mapId,
    cellIndex: position.cellIndex,
  });
  return doneStep();
}

/**
 * Builds the handler of the `move` task (spec 013/012, DECISIONS D-04): follows an A* path one
 * step at a time. Each tick adds the entity's `moveSpeed` to the task's `progress`; whenever the
 * progress covers the move cost of the next cell (5 fastest to 25 very slow terrain) the entity
 * enters it, so faster terrain and faster characters move more cells per tick. A next cell that
 * turned non-traversable triggers a re-plan from the current cell (at most {@link maxRepaths}
 * times, then `blocked`); no path at all fails with `unreachable`. `entity.movement.started` is
 * emitted with the first step and `entity.movement.completed` on arrival. All progress lives in
 * the task record, so a save resumes mid-walk.
 *
 * @param engine - The engine whose maps and pathfinding service the handler uses.
 * @returns The task handler for type `move`.
 */
export function createMoveTask(engine: GameEngine): TaskHandler {
  return {
    type: AiTaskType.Move,
    requires: ["Position"],
    start: (context, request) => {
      const parsed = moveRequestSchema.parse(request);
      const position = getComponent(context.entity, positionComponent);
      if (position === undefined || position.mapId !== parsed.mapId) {
        return failStep(unreachableReason);
      }
      const data: MoveData = {
        ...parsed,
        path: [],
        progress: 0,
        repaths: 0,
        started: false,
      };
      if (!plan(engine, data, position.cellIndex)) {
        return failStep(unreachableReason);
      }
      context.task.phase = "walk";
      return advance(engine, context, data);
    },
    step: (context, record: TaskRecord) =>
      advance(engine, context, moveDataSchema.parse(record.data)),
    cancel: () => undefined,
  };
}
