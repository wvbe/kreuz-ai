import type { NeedContent } from "../../content/schemas/characterSchemas";
import type { Entity } from "../../ecs/Entity";
import { combineMilli } from "../../inventory/inventoryMath";
import { needModifiers } from "../../skills/traitModifiers";
import type { SkillContentView } from "../../skills/skillTypes";
import { maxMeterMilli } from "../aiTypes";

/**
 * Clamps a need, mood or health value into `0..100000` milli-percent.
 *
 * @param valueMilli - Any integer.
 * @returns The value inside the meter range.
 */
export function clampMeter(valueMilli: number): number {
  return Math.min(maxMeterMilli, Math.max(0, valueMilli));
}

/**
 * How much a need falls in one tick (DECISIONS D-25): the authored `decayPerTick` combined (027
 * FR-014, never below 1) with the difficulty multiplier and then with the product of the entity's
 * trait `decayRateMultiplier`s for that need. Thresholds and satisfaction are never scaled by
 * the difficulty (spec 013 FR-002).
 *
 * @param content - Content with the trait table.
 * @param entity - Entity whose traits are read.
 * @param need - The need record.
 * @param difficultyMultiplierPermille - `needDecayMultiplier` in force (1000 = unchanged).
 * @returns Milli-percent to subtract, at least 1 unless the need does not decay.
 */
export function decayAmountMilli(
  content: SkillContentView,
  entity: Entity,
  need: NeedContent,
  difficultyMultiplierPermille: number,
): number {
  const scaled = combineMilli(need.decayPerTick, difficultyMultiplierPermille);
  const traits = needModifiers(content, entity, need.id).decayRateMultiplierPermille;
  return combineMilli(scaled, traits);
}

/**
 * How much satisfying a need gives: the authored amount combined with the product of the
 * entity's trait `satisfactionBonusMultiplier`s for that need.
 *
 * @param content - Content with the trait table.
 * @param entity - Entity whose traits are read.
 * @param needId - Need being satisfied.
 * @param amountMilli - Authored amount (milli-percent).
 * @returns Milli-percent to add.
 */
export function satisfactionAmountMilli(
  content: SkillContentView,
  entity: Entity,
  needId: string,
  amountMilli: number,
): number {
  return combineMilli(
    amountMilli,
    needModifiers(content, entity, needId).satisfactionBonusMultiplierPermille,
  );
}

/**
 * Whether a need level is critical: at or below the authored threshold (DECISIONS D-25).
 *
 * @param need - The need record.
 * @param valueMilli - Current level.
 * @returns True when critical.
 */
export function isCritical(need: NeedContent, valueMilli: number): boolean {
  return valueMilli <= need.criticalThreshold;
}
