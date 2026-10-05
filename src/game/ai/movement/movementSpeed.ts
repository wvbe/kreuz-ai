import type { Entity } from "../../ecs/Entity";
import { truncDiv } from "../../engine/fixedPoint";
import { PerformanceStat } from "../../content/contentTypes";
import type { SkillContentView } from "../../skills/skillTypes";
import { traitPerformance } from "../../skills/traitModifiers";

/**
 * Movement progress per tick of an entity without modifiers (DECISIONS D-04: 10 = one cell of
 * normal terrain per tick).
 */
export const defaultMoveSpeed = 10;

/**
 * Movement progress per tick of an entity: {@link defaultMoveSpeed} scaled by the product of its
 * traits' `speed_multiplier` modifiers that apply to unskilled work (`ALL_WORK`), at least 1.
 *
 * @param content - Content with the trait table.
 * @param entity - The moving entity.
 * @returns Integer progress per tick.
 */
export function moveSpeedOf(content: SkillContentView, entity: Entity): number {
  const multiplier = traitPerformance(content, entity, null, PerformanceStat.SpeedMultiplier);
  return Math.max(1, truncDiv(defaultMoveSpeed * multiplier, 1000));
}
