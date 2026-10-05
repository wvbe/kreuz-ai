import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { factionsSystemId } from "../factions/factionTypes";
import { skillsSystemId } from "../skills/registerSkills";
import { pauseBoard, resumeBoard } from "./boardPause";
import { postFellJobs, registerFellTrees } from "./fellTrees";
import { jobBoardComponent } from "./jobBoardComponent";
import { findPosting, listBoards, requireBoard } from "./jobBoards";
import { registerJobHandlers } from "./jobBehavior";
import { JobError, JobErrorKind } from "./JobError";
import { postJob, releasePosting } from "./jobPostings";
import { JobService } from "./JobService";
import { bindJobService, getJobService } from "./jobServiceRegistry";
import { JobBoardMode, PauseSource, jobsSystemId } from "./jobTypes";
import { createVisitTask } from "./jobVisitTask";
import { buildBoardSummaries, buildBoardView, buildPostingView } from "./jobViews";

const registered = new WeakSet<GameEngine>();

const boardArgsSchema = z.object({ boardId: z.number().int().min(1) }).strict();
const postingArgsSchema = z.object({ postingId: z.number().int().min(1) }).strict();

const postPayloadSchema = z
  .object({
    boardId: z.number().int().min(1),
    jobTypeId: z.string().min(1),
    mapId: z.number().int().min(1),
    cellIndex: z.number().int().min(0),
    entityId: z.number().int().min(1).optional(),
    materialId: z.string().min(1).optional(),
    priority: z.number().int().min(0).max(100).optional(),
    urgent: z.boolean().optional(),
    wage: z.number().int().min(0).optional(),
  })
  .strict();

type PostPayload = z.infer<typeof postPayloadSchema>;

function postFromCommand(engine: GameEngine, payload: PostPayload): { postingId: number } {
  const posting = postJob(
    engine,
    payload.boardId,
    {
      jobTypeId: payload.jobTypeId,
      target: {
        mapId: payload.mapId,
        cellIndex: payload.cellIndex,
        entityId: payload.entityId ?? null,
        materialId: payload.materialId ?? null,
      },
      ...(payload.priority === undefined ? {} : { priority: payload.priority }),
      ...(payload.urgent === undefined ? {} : { urgent: payload.urgent }),
      ...(payload.wage === undefined ? {} : { wage: payload.wage }),
    },
    engine.time.tickCount,
  );
  return { postingId: posting.id };
}

/**
 * Registers the job boards with an engine (once per engine; the engine does it for itself, so
 * every game has it). It adds:
 * - the `JobBoard` component (the worldgen `job_board` prototype carries it) and the save section
 *   `systems.jobboard` (claim back-offs);
 * - the task types `jobboard.visit` and `fell.trees`, the behavior handlers `jobs_available` and
 *   `claim_job` (named by `basic_needs`);
 * - the slot-7 system `jobboard` (drops expired back-offs, runs the `fell.trees` auto-poster);
 * - a before-delete hook that releases the claims of a deleted worker;
 * - the commands `SetJobBoardPaused {boardId, paused}` (player pause), `PostJob` (user-managed
 *   boards only, immediate until the Town Crier of 3.1c) and `PostCustomJob` (any board,
 *   immediate) and the queries `job-boards`, `jobs-on {boardId}` and `job {postingId}`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`.
 * @returns The engine's job service.
 */
export function registerJobs(engine: GameEngine): JobService {
  if (registered.has(engine)) {
    return getJobService(engine);
  }
  registered.add(engine);
  const service = new JobService();
  bindJobService(engine, service);
  engine.taskHandlers.register(createVisitTask(engine));
  registerFellTrees(engine);
  registerJobHandlers(engine);
  engine.store.addBeforeDeleteHook((entity) => {
    const data = getComponent(entity, jobBoardComponent);
    if (data === undefined) {
      for (const board of listBoards(engine)) {
        for (const posting of getComponent(board, jobBoardComponent)?.postings ?? []) {
          if (posting.claimantId === entity.id) {
            releasePosting(
              engine,
              posting.id,
              entity.id,
              "worker_deleted",
              engine.time.tickCount,
              false,
            );
          }
        }
      }
      service.forgetEntity(entity.id);
    }
    return null;
  });
  engine.registerSystem({
    id: jobsSystemId,
    dependencies: [aiSystemId, factionsSystemId, skillsSystemId],
    slot: TickSlot.JobBoards,
    components: [jobBoardComponent],
    saveSection: service.createSection(),
    run: (context) => {
      service.prune(context.tick, (postingId) => findPosting(engine, postingId) !== null);
      postFellJobs(engine, context.tick);
    },
    commandHandlers: {
      SetJobBoardPaused: defineCommand({
        schema: z.object({ boardId: z.number().int().min(1), paused: z.boolean() }).strict(),
        handler: (payload, target) => {
          requireBoard(target, payload.boardId);
          const changed = payload.paused
            ? pauseBoard(target, payload.boardId, PauseSource.Player)
            : resumeBoard(target, payload.boardId, PauseSource.Player);
          return { changed };
        },
      }),
      PostJob: defineCommand({
        schema: postPayloadSchema,
        handler: (payload, target) => {
          if (requireBoard(target, payload.boardId).data.mode !== JobBoardMode.UserManaged) {
            throw new JobError(
              JobErrorKind.BoardNotUserManaged,
              `board ${payload.boardId} is system-managed`,
            );
          }
          return postFromCommand(target, payload);
        },
      }),
      PostCustomJob: defineCommand({
        schema: postPayloadSchema,
        handler: (payload, target) => postFromCommand(target, payload),
      }),
    },
    queries: {
      "job-boards": defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) => buildBoardSummaries(target),
      }),
      "jobs-on": defineQuery({
        schema: boardArgsSchema,
        run: ({ boardId }, target) => buildBoardView(target, boardId),
      }),
      job: defineQuery({
        schema: postingArgsSchema,
        run: ({ postingId }, target) => buildPostingView(target, postingId),
      }),
    },
  });
  return service;
}
