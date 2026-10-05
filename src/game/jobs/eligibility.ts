import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { getStanding } from "../factions/factionStanding";
import { skillLevel } from "../skills/skillLevels";
import { getJobService } from "./jobServiceRegistry";
import { tierOrder } from "./JobService";
import { EligibilityKind, hostileStandingThreshold } from "./jobTypes";
import type { Eligibility, JobPosting } from "./jobTypes";

/**
 * The default predicates of a posting: a citizen who is not hostile to the poster (016 FR-001b,
 * 021 labour gate).
 *
 * @returns A fresh predicate list.
 */
export function defaultEligibility(): Eligibility[] {
  return [{ kind: EligibilityKind.AdultHumanoid }, { kind: EligibilityKind.NotHostileToPoster }];
}

function meanStandingToward(engine: GameEngine, worker: Entity, posterFactionId: number): number {
  const factions = (getComponent(worker, citizenComponent)?.factions ?? []).filter(
    (id) => id !== posterFactionId,
  );
  if (factions.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const factionId of factions) {
    sum += getStanding(engine, factionId, posterFactionId).value;
  }
  return Math.trunc(sum / factions.length);
}

/**
 * Evaluates one predicate for a worker at claim time (DECISIONS D-08). `NotHostileToPoster`: a
 * worker who belongs to the poster faction is eligible; otherwise the integer mean of
 * `standing[faction -> poster]` over the worker's factions must be at least -30. `TierUnlocked`
 * compares against the job service's tier source.
 *
 * @param engine - The engine.
 * @param worker - The would-be claimer.
 * @param posting - The posting that carries the predicate (for the poster faction).
 * @param predicate - The predicate.
 * @returns True when the worker passes.
 */
export function satisfiesEligibility(
  engine: GameEngine,
  worker: Entity,
  posting: JobPosting,
  predicate: Eligibility,
): boolean {
  const citizen = getComponent(worker, citizenComponent);
  switch (predicate.kind) {
    case EligibilityKind.AdultHumanoid:
      return citizen !== undefined;
    case EligibilityKind.FactionMember:
      return citizen?.factions.includes(predicate.factionId) ?? false;
    case EligibilityKind.NotHostileToPoster:
      if (posting.posterFactionId === null || citizen === undefined) {
        return true;
      }
      return (
        citizen.factions.includes(posting.posterFactionId) ||
        meanStandingToward(engine, worker, posting.posterFactionId) >= hostileStandingThreshold
      );
    case EligibilityKind.MinSkill:
      return skillLevel(worker, predicate.skillId) >= predicate.level;
    case EligibilityKind.TierUnlocked:
      return (
        tierOrder.indexOf(getJobService(engine).currentTier()) >= tierOrder.indexOf(predicate.tier)
      );
  }
}

/**
 * Whether a worker passes every predicate of a posting.
 *
 * @param engine - The engine.
 * @param worker - The would-be claimer.
 * @param posting - The posting.
 * @returns True when the worker may claim it.
 */
export function isEligible(engine: GameEngine, worker: Entity, posting: JobPosting): boolean {
  return posting.eligibility.every((predicate) =>
    satisfiesEligibility(engine, worker, posting, predicate),
  );
}
