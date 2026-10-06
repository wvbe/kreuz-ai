import type { Entity } from "../ecs/Entity";
import { SkillEffectKind } from "../content/contentTypes";
import { skillLevel } from "./skillLevels";
import { maxSkillLevel, preachingSkillId } from "./skillTypes";
import type { SkillContentView } from "./skillTypes";

/**
 * What a skill effect of one kind gives an entity at its current level: the sum of the skill's
 * effects of that kind, scaled linearly by the level, `floor(max * level / 100)` (D-20, D-90).
 * Units are those of the effect value (permille of a unit, or milli-percent for `faith_bonus`).
 *
 * @param content - Content with the skill table.
 * @param entity - Entity whose skill level is read.
 * @param skillId - Skill that carries the effect.
 * @param kind - Effect kind to add up.
 * @returns The scaled amount, 0 when the skill is not in the pack or has no such effect.
 */
export function skillEffectMilli(
  content: SkillContentView,
  entity: Entity,
  skillId: string,
  kind: SkillEffectKind,
): number {
  const skill = content.skills.find(skillId);
  if (skill === undefined) {
    return 0;
  }
  let max = 0;
  for (const effect of skill.outcomeEffects) {
    if (effect.kind === kind) {
      max += effect.value;
    }
  }
  return Math.floor((max * skillLevel(entity, skillId)) / maxSkillLevel);
}

/**
 * Milli-percent of faith a preacher adds to what listeners gain (`faith_bonus` of `preaching`,
 * "+5 at 100", D-90). The hook for the worship systems of the zone content (task 5.4).
 *
 * @param content - Content with the skill table.
 * @param entity - The preacher.
 * @returns Milli-percent, 0 without the skill.
 */
export function faithBonusMilli(content: SkillContentView, entity: Entity): number {
  return skillEffectMilli(content, entity, preachingSkillId, SkillEffectKind.FaithBonus);
}
