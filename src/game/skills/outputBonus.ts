import type { Entity } from "../ecs/Entity";
import { PerformanceStat, SkillEffectKind } from "../content/contentTypes";
import type { PrngStream } from "../engine/Prng";
import { skillLevel } from "./skillLevels";
import { maxSkillLevel } from "./skillTypes";
import type { SkillContentView, WorkRef } from "./skillTypes";
import { traitPerformance } from "./traitModifiers";

/**
 * Expected extra output units of a piece of work in milli-units (D-20):
 * `floor(maxExtraMilli * level / 100)` from the skill's `output_bonus` effect plus the additive
 * `output_bonus` trait modifiers (permille == milli-units).
 *
 * @param content - Content with skill, trait and recipe tables.
 * @param entity - The worker.
 * @param work - Recipe or job type record (anything with a `skillId`).
 * @returns Milli-units, 0 when nothing grants a bonus.
 */
export function expectedOutputBonusMilli(
  content: SkillContentView,
  entity: Entity,
  work: WorkRef,
): number {
  let expected = 0;
  if (work.skillId !== null) {
    const skill = content.skills.require(work.skillId);
    let maxExtra = 0;
    for (const effect of skill.outcomeEffects) {
      if (effect.kind === SkillEffectKind.OutputBonus) {
        maxExtra += effect.value;
      }
    }
    expected = Math.floor((maxExtra * skillLevel(entity, work.skillId)) / maxSkillLevel);
  }
  return expected + traitPerformance(content, entity, work.skillId, PerformanceStat.OutputBonus);
}

/**
 * Rolls the extra output units of one completed piece of work (D-20):
 * `floor(expected / 1000)` plus one more with probability `expected mod 1000` permille. Draws from
 * the given stream only when a fractional part exists, so callers pass
 * `engine.prng.stream(skillOutputStreamName)`.
 *
 * @param content - Content with skill, trait and recipe tables.
 * @param entity - The worker.
 * @param work - Recipe or job type record (anything with a `skillId`).
 * @param stream - The `skill.output` stream.
 * @returns Whole extra units, 0 or more.
 */
export function rollOutputBonus(
  content: SkillContentView,
  entity: Entity,
  work: WorkRef,
  stream: PrngStream,
): number {
  const expected = expectedOutputBonusMilli(content, entity, work);
  const whole = Math.floor(expected / 1000);
  const fraction = expected % 1000;
  return whole + (fraction > 0 && stream.chancePermille(fraction) ? 1 : 0);
}
