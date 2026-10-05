import { z } from "zod";
import { AiTaskType } from "../ai/aiTypes";
import { moveTaskData } from "../ai/movement/moveTask";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { childCompleted, registerJobType } from "../jobs/jobExecutor";
import type { ActiveJob, JobExecutor } from "../jobs/jobExecutor";
import { approachFailedReason, targetInvalidReason } from "../jobs/jobTypes";
import type { JobOutput } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { workDuration } from "../skills/workSpeed";
import {
  childWait,
  continueStep,
  doneStep,
  failStep,
  tickWait,
  waitStep,
} from "../task/stepResults";
import type { StepResult, TaskContext } from "../task/taskTypes";
import { findSite, missingMaterials } from "./buildSiteQueries";
import type { SiteRef } from "./buildSiteQueries";
import {
  constructJobId,
  jobClaimedByBuilderEvent,
  jobStartedEvent,
  siteBlockedReason,
  SiteKind,
  SiteStatus,
} from "./constructionTypes";
import type { JobBuilder } from "./constructionTypes";
import { deconstructionTicks, findBuildDefinition } from "./constructionDefinitions";
import { completeSite } from "./siteCompletion";

enum BuildPhase {
  ToSite = "to-site",
  Work = "work",
}

const buildStateSchema = z
  .object({
    postingId: z.number().int().min(1),
    claimId: z.number().int().min(1),
    siteId: z.number().int().min(1).nullable().default(null),
  })
  .strict();

type BuildState = z.infer<typeof buildStateSchema>;

function readState(data: JsonValue): BuildState {
  return buildStateSchema.parse(data);
}

function writeState(context: TaskContext, state: BuildState): void {
  context.task.data = { ...state };
}

function resolveSite(engine: GameEngine, job: ActiveJob): SiteRef | null {
  const siteId = job.posting.target.entityId;
  return siteId === null ? null : findSite(engine, siteId);
}

/**
 * Whether the site may be worked on now: every material delivered (a deconstruction needs none),
 * status `Building`, not paused.
 *
 * @param site - The site.
 * @returns True when a builder may start.
 */
function workable(site: SiteRef): boolean {
  return (
    site.data.status === SiteStatus.Building &&
    !site.data.paused &&
    missingMaterials(site).length === 0
  );
}

function resetBuilder(site: SiteRef, builderId: number): void {
  if (site.data.builderId === builderId) {
    site.data.builderId = null;
    site.data.startedTick = null;
    site.data.progress = 0;
    site.data.durationTicks = 0;
  }
}

function abort(
  engine: GameEngine,
  context: TaskContext,
  job: ActiveJob,
  reason: string,
): StepResult {
  const site = resolveSite(engine, job);
  if (site !== null) {
    resetBuilder(site, context.entityId);
  }
  return failStep(reason);
}

function startWork(
  engine: GameEngine,
  context: TaskContext,
  state: BuildState,
  job: ActiveJob,
  site: SiteRef,
): StepResult {
  const definition = findBuildDefinition(engine, site.data.prototypeId);
  if (definition === undefined || !workable(site)) {
    return abort(engine, context, job, targetInvalidReason);
  }
  const base =
    site.data.kind === SiteKind.Construct
      ? definition.constructionTicks
      : deconstructionTicks(definition);
  const durationTicks = workDuration(engine.content, context.entity, job.jobType, base);
  site.data.durationTicks = durationTicks;
  site.data.startedTick = context.tick;
  site.data.progress = 0;
  const payload: JobBuilder = { jobId: site.entity.id, builderId: context.entityId };
  engine.bus.emit(jobStartedEvent, payload);
  context.task.phase = BuildPhase.Work;
  writeState(context, state);
  return waitStep(tickWait(context.tick + durationTicks));
}

function goToSite(
  engine: GameEngine,
  context: TaskContext,
  state: BuildState,
  job: ActiveJob,
  site: SiteRef,
): StepResult {
  const place = job.posting.target;
  const here = getComponent(context.entity, positionComponent);
  if (here === undefined || here.mapId !== place.mapId) {
    return abort(engine, context, job, siteBlockedReason);
  }
  if (here.cellIndex === place.cellIndex) {
    return startWork(engine, context, state, job, site);
  }
  context.task.phase = BuildPhase.ToSite;
  writeState(context, state);
  return waitStep(
    childWait(context.spawnChild(AiTaskType.Move, moveTaskData(place.mapId, place.cellIndex))),
  );
}

function begin(engine: GameEngine, context: TaskContext, job: ActiveJob): StepResult {
  const state = readState(context.task.data);
  const site = resolveSite(engine, job);
  if (site === null || !workable(site)) {
    return failStep(targetInvalidReason);
  }
  if (site.data.builderId !== null && site.data.builderId !== context.entityId) {
    return failStep(siteBlockedReason);
  }
  site.data.builderId = context.entityId;
  site.data.startedTick = null;
  state.siteId = site.entity.id;
  const payload: JobBuilder = { jobId: site.entity.id, builderId: context.entityId };
  engine.bus.emit(jobClaimedByBuilderEvent, payload);
  return goToSite(engine, context, state, job, site);
}

/**
 * Builds the executor of `build.construct` (spec 016 FR-007/FR-008/FR-012, plan 3.5). A claimed
 * posting names a build site (`target.entityId`) whose materials are all delivered (or a
 * deconstruction). One builder works at a time. The builder:
 * 1. takes the job (`construction.job.claimed`), walks to the site cell (phase `to-site`);
 * 2. fixes the duration with `workDuration` for the job type's skill `construction` (base ticks
 *    of the definition, half for a deconstruction), emits `construction.job.started` and waits that
 *    many ticks (phase `work`, a serialized tick wait, so a save resumes exactly; the site's
 *    `progress` counts up each tick);
 * 3. `complete` finishes the site (`completeSite`): the building is placed or removed and
 *    `construction.job.completed` is queued. The job framework then completes the posting and
 *    emits `skill.work.completed` for `construction` once.
 *
 * Interrupt safety (FR-011): a failed or cancelled task puts the site back to "nobody works"
 * (progress 0); the delivered materials stay on the site and the next builder starts the phase
 * again. Failure reasons: `target_invalid`, `site_blocked`, `approach_failed`.
 *
 * @param engine - The engine.
 * @returns An executor for `registerJobType`.
 */
export function createConstructExecutor(engine: GameEngine): JobExecutor {
  return {
    requires: ["Position"],
    start: (context, job) => begin(engine, context, job),
    step: (context, record, job) => {
      const state = readState(record.data);
      const site = resolveSite(engine, job);
      if (site === null) {
        return abort(engine, context, job, targetInvalidReason);
      }
      if (record.phase === BuildPhase.ToSite) {
        return childCompleted(record)
          ? goToSite(engine, context, state, job, site)
          : abort(engine, context, job, approachFailedReason);
      }
      return record.wake === null ? continueStep() : doneStep();
    },
    complete: (context, job): JobOutput[] | null => {
      const siteId = job.posting.target.entityId;
      if (siteId === null || !completeSite(engine, siteId)) {
        const site = resolveSite(engine, job);
        if (site !== null) {
          resetBuilder(site, context.entityId);
        }
        return null;
      }
      return [];
    },
    cancel: (context, record) => {
      const state = readState(record.data);
      const site = state.siteId === null ? null : findSite(engine, state.siteId);
      if (site !== null) {
        resetBuilder(site, context.entityId);
      }
    },
  };
}

/**
 * Registers the executor of `build.construct` with the engine's task handlers (see
 * {@link createConstructExecutor}).
 *
 * @param engine - The engine.
 */
export function registerConstruct(engine: GameEngine): void {
  registerJobType(engine, constructJobId, createConstructExecutor(engine));
}
