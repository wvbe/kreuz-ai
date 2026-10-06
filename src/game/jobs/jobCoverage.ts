import type { GameEngine } from "../engine/GameEngine";

/**
 * Job types of the v0 content pack that are on the board list but deliberately have no executor
 * yet. They are never offered to a worker (a posting needs a registered task handler, D-46) and
 * no system posts them. `farm.tend` waits for seasons and weeding (the crop model of D-52 has no
 * tending step).
 */
export const deferredJobTypeIds: readonly string[] = ["farm.tend"];

/**
 * Checks the content hooks of task 3.1d: every job type of the content pack that is posted on
 * boards must have an executor (a registered task handler of the same id) or be named in
 * {@link deferredJobTypeIds}.
 *
 * @param engine - The engine with its content and handlers.
 * @param deferred - Ids that may stay without an executor (default {@link deferredJobTypeIds}).
 * @returns The ids of the job types that are neither executable nor deferred, in file order;
 * empty when the hooks are complete.
 */
export function findUnhandledJobTypes(
  engine: GameEngine,
  deferred: readonly string[] = deferredJobTypeIds,
): string[] {
  return engine.content.jobs
    .all()
    .filter(
      (jobType) =>
        jobType.onBoard && !engine.taskHandlers.has(jobType.id) && !deferred.includes(jobType.id),
    )
    .map((jobType) => jobType.id);
}
