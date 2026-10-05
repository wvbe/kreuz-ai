import type { Entity } from "../ecs/Entity";
import { skillLevel } from "./skillLevels";

/**
 * Width of one familiarity bucket in skill levels (DECISIONS D-08).
 */
export const familiarityBucketWidth = 10;

/**
 * Familiarity bucket `0..10` of one skill: `floor(level / 10)`.
 *
 * @param entity - Entity to read.
 * @param skillId - Skill id.
 * @returns The bucket.
 */
export function familiarityBucket(entity: Entity, skillId: string): number {
  return Math.floor(skillLevel(entity, skillId) / familiarityBucketWidth);
}

/**
 * The single skill-affinity score of the game (DECISIONS D-43, resolving 017/020): the best
 * familiarity bucket `0..10` over the given skill ids, 0 for an empty list. Job claiming sorts on
 * it (`familiarityBucket` of the job type's `skillDomain`, D-08), zones and haulers compare levels
 * through `skillLevel`. Integer, pure and independent of content.
 *
 * @param entity - Entity to score.
 * @param skillIds - Skill ids the work or zone is about (usually one, `[]` for no domain).
 * @returns The score `0..10`.
 */
export function affinityScore(entity: Entity, skillIds: readonly string[]): number {
  let best = 0;
  for (const skillId of skillIds) {
    best = Math.max(best, familiarityBucket(entity, skillId));
  }
  return best;
}
