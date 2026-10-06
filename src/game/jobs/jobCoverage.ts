import type { GameEngine } from "../engine/GameEngine";

/**
 * Why a job type that is on the board list has no executor yet.
 */
export enum DeferralReason {
  /**
   * No tending step in the crop model (D-52).
   */
  NoTendingStep = "no-tending-step",
  /**
   * Needs the animal system (livestock, wild game, bees): wired by the animals task (5.3 part 2b).
   */
  NeedsAnimals = "needs-animals",
  /**
   * Needs a combat and threat system (patrol routes, watch duty) that no task has built yet.
   */
  NeedsThreats = "needs-threats",
  /**
   * Needs a chapel or church zone and a congregation (faith need) that the zone catalogue does not
   * have yet.
   */
  NeedsChurch = "needs-church",
  /**
   * Needs a death and body model (a citizen that dies is deleted today).
   */
  NeedsBodies = "needs-bodies",
}

/**
 * Job types of the content pack that are on the board list but deliberately have no executor
 * yet, with the reason (DECISIONS D-130). They are never offered to a worker (a posting needs a
 * registered task handler, D-46) and no system posts them. Agent-owned follow-ups: the animal
 * jobs (`tend.animals`, `tend.bees`, `hunt.game`, `butcher.animal`) are wired by the animals task
 * and must be removed from this list when their executors exist.
 */
export const deferredJobReasons: Readonly<Record<string, DeferralReason>> = {
  "farm.tend": DeferralReason.NoTendingStep,
  "tend.animals": DeferralReason.NeedsAnimals,
  "tend.bees": DeferralReason.NeedsAnimals,
  "hunt.game": DeferralReason.NeedsAnimals,
  "butcher.animal": DeferralReason.NeedsAnimals,
  "guard.patrol": DeferralReason.NeedsThreats,
  "guard.watch": DeferralReason.NeedsThreats,
  "preach.sermon": DeferralReason.NeedsChurch,
  "preach.pray": DeferralReason.NeedsChurch,
  "haul.bury": DeferralReason.NeedsBodies,
};

/**
 * The ids of {@link deferredJobReasons}, in declaration order.
 */
export const deferredJobTypeIds: readonly string[] = Object.keys(deferredJobReasons);

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
