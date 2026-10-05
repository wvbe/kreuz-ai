import { NeedPlanKind } from "../../ai/decision/needPlanTypes";
import { AiTaskType } from "../../ai/aiTypes";
import { getComponent, hasComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import { isJsonObject } from "../../ecs/jsonData";
import type { GameEngine } from "../../engine/GameEngine";
import { citizenComponent } from "../../factions/citizenComponent";
import { rankPostings } from "../../jobs/claimJob";
import { isEligible } from "../../jobs/eligibility";
import { isBoardPaused, listBoards, offeredPostings } from "../../jobs/jobBoards";
import { jobBoardComponent } from "../../jobs/jobBoardComponent";
import { getJobService } from "../../jobs/jobServiceRegistry";
import { EligibilityKind, visitTaskType } from "../../jobs/jobTypes";
import type { JobBoardData, JobPosting } from "../../jobs/jobTypes";
import { positionComponent } from "../../map/positionComponent";
import { taskQueueComponent } from "../../task/taskQueueComponent";
import { TaskStatus } from "../../task/taskTypes";
import type { TaskRecord } from "../../task/taskTypes";
import { makeReason } from "../reasons";
import type { StatusContext } from "../statusContext";
import { ActivityKind, BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import type {
  Activity,
  Reason,
  StatusProvider,
  StatusSubjectRef,
  SubjectStatus,
} from "../statusTypes";

function isCitizen(engine: GameEngine, entity: Entity): boolean {
  return (
    hasComponent(entity, citizenComponent) &&
    hasComponent(entity, taskQueueComponent) &&
    !engine.store.isPendingDelete(entity.id)
  );
}

function topTask(entity: Entity): TaskRecord | null {
  return (getComponent(entity, taskQueueComponent)?.tasks ?? [])
    .filter((task) => task.parentId === null && task.status !== TaskStatus.Completed)
    .reduce<TaskRecord | null>(
      (best, task) => (best === null || task.priority > best.priority ? task : best),
      null,
    );
}

function claimedPostingOf(engine: GameEngine, citizenId: number): JobPosting | null {
  for (const board of listBoards(engine)) {
    const posting = getComponent(board, jobBoardComponent)?.postings.find(
      (candidate) => candidate.claimantId === citizenId,
    );
    if (posting !== undefined) {
      return posting;
    }
  }
  return null;
}

// What the citizen is doing when it is busy: working a claimed job, sleeping, fetching or
// consuming an item for a need, or walking to a board. Null for a citizen with no task or only
// wandering and standing around.
function activityOf(engine: GameEngine, entity: Entity): Activity | null {
  const task = topTask(entity);
  if (task === null || task.type === AiTaskType.Idle || task.type === AiTaskType.Move) {
    return null;
  }
  const data = isJsonObject(task.data) ? task.data : {};
  if (task.type === AiTaskType.Satisfy) {
    const plan = isJsonObject(data["plan"]) ? data["plan"] : {};
    return plan["kind"] === NeedPlanKind.Sleep
      ? { kind: ActivityKind.Sleeping, params: { needId: plan["needId"] ?? null } }
      : {
          kind: ActivityKind.Eating,
          params: { needId: plan["needId"] ?? null, materialId: plan["materialId"] ?? null },
        };
  }
  if (task.type === visitTaskType) {
    return { kind: ActivityKind.WalkingToBoard, params: { boardId: data["boardId"] ?? null } };
  }
  return {
    kind: ActivityKind.Working,
    params: {
      jobTypeId: task.type,
      postingId: claimedPostingOf(engine, entity.id)?.id ?? null,
    },
  };
}

function skillRequirement(posting: JobPosting): { skillId: string | null; requiredLevel: number } {
  for (const predicate of posting.eligibility) {
    if (predicate.kind === EligibilityKind.MinSkill) {
      return { skillId: predicate.skillId, requiredLevel: predicate.level };
    }
  }
  return { skillId: null, requiredLevel: 0 };
}

// Why an idle citizen does not work (spec 025 US1 scenarios 2 and 3), derived the way the claim
// does: no reachable board (`NoReachableJobBoard`), every reachable board paused (`Paused`), no
// posting on the running boards (`NoJobsAvailable`), postings that this citizen cannot take
// (`Unreachable`, `NoQualifiedWorker`, or `NoJobsAvailable` for those it is backed off from) or a
// claimable posting it has not walked to yet (`AwaitingDecision`).
function idleReasons(engine: GameEngine, entity: Entity, context: StatusContext): Reason[] {
  const position = getComponent(entity, positionComponent);
  const costs = context.reachCosts(entity);
  const reachable: { id: number; cost: number; paused: boolean; data: JobBoardData }[] = [];
  for (const board of listBoards(engine)) {
    const data = getComponent(board, jobBoardComponent);
    const place = getComponent(board, positionComponent);
    const cost = place === undefined ? undefined : costs?.get(place.cellIndex);
    if (data !== undefined && cost !== undefined && place?.mapId === position?.mapId) {
      reachable.push({ id: board.id, cost, paused: isBoardPaused(data), data });
    }
  }
  reachable.sort((left, right) => left.cost - right.cost || left.id - right.id);
  if (reachable.length === 0) {
    return [makeReason(BlockedReasonKind.NoReachableJobBoard)];
  }
  const running = reachable.filter((board) => !board.paused);
  const first = running[0];
  if (first === undefined) {
    const paused = reachable[0];
    return [
      makeReason(
        BlockedReasonKind.Paused,
        { jobBoardId: paused?.id ?? 0 },
        { kind: StatusSubjectKind.JobBoard, id: paused?.id ?? 0 },
      ),
    ];
  }
  const target =
    costs === null
      ? undefined
      : running.find(
          (board) =>
            rankPostings(engine, entity, board.id, engine.time.tickCount, costs).length > 0,
        );
  if (target !== undefined) {
    return [makeReason(BlockedReasonKind.AwaitingDecision, { boardId: target.id })];
  }
  const offered = running.flatMap((board) =>
    offeredPostings(board.data).filter((posting) => engine.taskHandlers.has(posting.jobTypeId)),
  );
  if (offered.length === 0) {
    return [makeReason(BlockedReasonKind.NoJobsAvailable, { jobBoardId: first.id })];
  }
  const reasons: Reason[] = [];
  const service = getJobService(engine);
  for (const posting of offered) {
    if (!isEligible(engine, entity, posting)) {
      const need = skillRequirement(posting);
      reasons.push(makeReason(BlockedReasonKind.NoQualifiedWorker, need));
    } else if (
      costs?.get(posting.target.cellIndex) === undefined ||
      posting.target.mapId !== position?.mapId
    ) {
      reasons.push(
        makeReason(BlockedReasonKind.Unreachable, { entityId: posting.target.entityId ?? 0 }),
      );
    } else if (service.isBackedOff(entity.id, posting.id, engine.time.tickCount)) {
      reasons.push(makeReason(BlockedReasonKind.NoJobsAvailable, { jobBoardId: first.id }));
    }
  }
  return reasons.length === 0
    ? [makeReason(BlockedReasonKind.NoJobsAvailable, { jobBoardId: first.id })]
    : reasons;
}

/**
 * The status provider of citizens (spec 025 subject `Citizen`): a citizen with a task is Active
 * and says what it does (`activity`); one without is Idle with the reasons it finds no work.
 */
export const citizenProvider: StatusProvider = {
  kind: StatusSubjectKind.Citizen,
  subjects: (engine) =>
    engine.store
      .entities()
      .filter((entity) => isCitizen(engine, entity))
      .map((entity): StatusSubjectRef => ({ kind: StatusSubjectKind.Citizen, id: entity.id })),
  evaluate: (engine, ref, context): SubjectStatus | null => {
    const entity = engine.store.get(ref.id);
    if (entity === undefined || !isCitizen(engine, entity)) {
      return null;
    }
    const activity = activityOf(engine, entity);
    if (activity !== null) {
      return { state: StatusState.Active, activity, reasons: [] };
    }
    return {
      state: StatusState.Idle,
      activity: null,
      reasons: idleReasons(engine, entity, context),
    };
  },
};
