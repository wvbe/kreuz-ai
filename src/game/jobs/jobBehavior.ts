import { NodeStatus } from "../behavior/behaviorTypes";
import type { BehaviorContext } from "../behavior/behaviorTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { findBoardToVisit } from "./claimJob";
import { listBoards, offeredPostings } from "./jobBoards";
import { jobBoardComponent } from "./jobBoardComponent";
import { jobTaskPriority, visitTaskType } from "./jobTypes";
import { visitTaskData } from "./jobVisitTask";

/**
 * Id of the condition that is true while some running board offers an open posting whose job type
 * has an executor.
 */
export const jobsAvailableId = "jobs_available";

/**
 * Id of the action that sends an idle worker to the nearest board that has work for it.
 */
export const claimJobId = "claim_job";

/**
 * The condition `jobs_available`: a cheap pre-check (no path search) so settlers only evaluate
 * the claim order when there is something on a running board.
 *
 * @param engine - The engine.
 * @returns Success or failure.
 */
export function jobsAvailable(engine: GameEngine): NodeStatus {
  const offered = listBoards(engine).some((board) => {
    const data = getComponent(board, jobBoardComponent);
    return (
      data !== undefined &&
      offeredPostings(data).some((posting) => engine.taskHandlers.has(posting.jobTypeId))
    );
  });
  return offered ? NodeStatus.Success : NodeStatus.Failure;
}

/**
 * The action `claim_job` (spec 017 US1, DECISIONS D-45): an entity with no job or need task looks
 * for the nearest reachable board with a posting it may claim (`findBoardToVisit`: nearest board
 * first, eligibility, back-off, claim order) and enqueues a `jobboard.visit` task at job priority
 * 50; the claim itself happens on arrival. It fails, so the tree falls through to idle behavior,
 * when the entity already has a task at job priority or above or no board has work for it.
 *
 * @param engine - The engine.
 * @param context - Behavior context of the evaluated node.
 * @returns Success when a visit was enqueued, failure otherwise.
 */
export function claimJob(engine: GameEngine, context: BehaviorContext): NodeStatus {
  const queue = getComponent(context.entity, taskQueueComponent);
  if (queue === undefined || queue.tasks.some((task) => task.priority >= jobTaskPriority)) {
    return NodeStatus.Failure;
  }
  const boardId = findBoardToVisit(engine, context.entity, context.tick);
  if (boardId === null) {
    return NodeStatus.Failure;
  }
  engine.tasks.enqueue(context.entityId, {
    type: visitTaskType,
    data: visitTaskData(boardId),
    priority: jobTaskPriority,
  });
  return NodeStatus.Success;
}

/**
 * Registers the condition and the action the `basic_needs` tree names for jobs.
 *
 * @param engine - The engine; call before the first `newGame` / `loadGame`.
 */
export function registerJobHandlers(engine: GameEngine): void {
  engine.behaviorHandlers.registerCondition(jobsAvailableId, () => jobsAvailable(engine));
  engine.behaviorHandlers.registerAction(claimJobId, (context) => claimJob(engine, context));
}
