import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { skillsComponent } from "./skillsComponent";
import { milliPerLevel } from "./skillTypes";

/**
 * Converts accumulated milli-percent experience to the integer level `0..100`.
 *
 * @param valueMilli - Accumulated experience, `0..100000`.
 * @returns `floor(valueMilli / 1000)`.
 */
export function levelOfMilli(valueMilli: number): number {
  return Math.floor(valueMilli / milliPerLevel);
}

/**
 * Accumulated experience of one skill (0 when the entity has no `Skills` component or no entry).
 *
 * @param entity - Entity to read.
 * @param skillId - Skill id.
 * @returns Milli-percent `0..100000`.
 */
export function skillValueMilli(entity: Entity, skillId: string): number {
  return getComponent(entity, skillsComponent)?.values[skillId] ?? 0;
}

/**
 * Integer level `0..100` of one skill (spec 020 FR-002).
 *
 * @param entity - Entity to read.
 * @param skillId - Skill id.
 * @returns The level.
 */
export function skillLevel(entity: Entity, skillId: string): number {
  return levelOfMilli(skillValueMilli(entity, skillId));
}

/**
 * The skill with the highest accumulated value: ties go to the lexicographically smallest skill
 * id, all zero gives null (DECISIONS D-20). Pure; no PRNG.
 *
 * @param entity - Entity to read.
 * @returns The dominant skill id or null.
 */
export function dominantSkill(entity: Entity): string | null {
  const values = getComponent(entity, skillsComponent)?.values ?? {};
  let best: string | null = null;
  let bestValue = 0;
  for (const skillId of Object.keys(values).sort()) {
    const value = values[skillId] ?? 0;
    if (value > bestValue) {
      best = skillId;
      bestValue = value;
    }
  }
  return best;
}
