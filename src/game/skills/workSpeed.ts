import type { Entity } from "../ecs/Entity";
import { PerformanceStat, SkillEffectKind } from "../content/contentTypes";
import { ceilDiv } from "../engine/fixedPoint";
import { skillLevel } from "./skillLevels";
import { maxSkillLevel } from "./skillTypes";
import type { SkillContentView, WorkRef } from "./skillTypes";
import { traitPerformance } from "./traitModifiers";

/**
 * How fast an entity does a piece of work (DECISIONS D-20).
 */
export type WorkSpeed = {
  /**
   * Skill the work uses, or null.
   */
  skillId: string | null;
  /**
   * Integer skill level `0..100` (0 without skill).
   */
  level: number;
  /**
   * `maxSpeedBonus * level / 100` in permille, `0..1000` (0 when the skill has no speed effect).
   */
  speedBonusPermille: number;
  /**
   * Product of the entity's `multiplier` and `speed_multiplier` trait modifiers that cover the
   * skill, permille, at least 1 (1000 = unchanged).
   */
  traitMultiplierPermille: number;
  /**
   * Overall speed relative to the baseline, `floor(traitMultiplier * 1000 / (1000 - speedBonus))`
   * in permille: 1000 = baseline, 2000 = twice as fast. For display and comparison; durations
   * use {@link workDuration}.
   */
  speedPermille: number;
};

/**
 * The work-speed formula (spec 020 FR-007/FR-008, D-20): the skill's `max_speed_bonus` effect
 * scaled by the entity's level, combined with the multiplicative trait modifiers. Pure; reads the
 * entity's `Skills` and `Traits` and the content tables only.
 *
 * @param content - Content with skill, trait and recipe tables.
 * @param entity - The worker.
 * @param work - Recipe or job type record (anything with a `skillId`).
 * @returns The speed breakdown.
 */
export function workSpeed(content: SkillContentView, entity: Entity, work: WorkRef): WorkSpeed {
  const skillId = work.skillId;
  let level = 0;
  let speedBonusPermille = 0;
  if (skillId !== null) {
    level = skillLevel(entity, skillId);
    const skill = content.skills.require(skillId);
    let maxBonus = 0;
    for (const effect of skill.outcomeEffects) {
      if (effect.kind === SkillEffectKind.MaxSpeedBonus) {
        maxBonus += effect.value;
      }
    }
    speedBonusPermille = Math.min(1000, Math.floor((maxBonus * level) / maxSkillLevel));
  }
  const multiplier = traitPerformance(content, entity, skillId, PerformanceStat.Multiplier);
  const speedMultiplier = traitPerformance(
    content,
    entity,
    skillId,
    PerformanceStat.SpeedMultiplier,
  );
  const traitMultiplierPermille = Math.max(1, Math.trunc((multiplier * speedMultiplier) / 1000));
  const remaining = Math.max(1, 1000 - speedBonusPermille);
  return {
    skillId,
    level,
    speedBonusPermille,
    traitMultiplierPermille,
    speedPermille: Math.floor((traitMultiplierPermille * 1000) / remaining),
  };
}

/**
 * Duration in whole ticks for a piece of work, fixed when the work starts (D-20):
 * `max(1, ceilDiv(base * (1000 - speedBonus) * 1000, 1000 * traitMultiplier))`.
 *
 * @param content - Content with skill, trait and recipe tables.
 * @param entity - The worker.
 * @param work - Recipe or job type record (anything with a `skillId`).
 * @param baseTicks - Duration at skill 0 without traits, whole ticks >= 0.
 * @returns Ticks, at least 1.
 */
export function workDuration(
  content: SkillContentView,
  entity: Entity,
  work: WorkRef,
  baseTicks: number,
): number {
  const speed = workSpeed(content, entity, work);
  return Math.max(
    1,
    ceilDiv(
      baseTicks * (1000 - speed.speedBonusPermille) * 1000,
      1000 * speed.traitMultiplierPermille,
    ),
  );
}
