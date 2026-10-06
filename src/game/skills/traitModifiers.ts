import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import {
  PerformanceStat,
  SkillEffectKind,
  SkillWildcard,
  TraitModifierKind,
} from "../content/contentTypes";
import type { TraitContent } from "../content/schemas/characterSchemas";
import { skillEffectMilli } from "./skillEffects";
import { traitsComponent } from "./skillsComponent";
import { tradingSkillId } from "./skillTypes";
import type { SkillContentView } from "./skillTypes";

/**
 * Effect of all traits of an entity on one need (DECISIONS D-20).
 */
export type NeedModifierTotals = {
  /**
   * Permille factor on the need's decay per tick (1000 = unchanged), product over traits.
   */
  decayRateMultiplierPermille: number;
  /**
   * Permille factor on what satisfying the need gives (1000 = unchanged), product over traits.
   */
  satisfactionBonusMultiplierPermille: number;
  /**
   * Milli-percent added to mood while the trait is present (sum over traits; the `mood` pseudo
   * need is read by the mood system).
   */
  moodBonusMilli: number;
};

const permilleOne = 1000;

function productPermille(left: number, right: number): number {
  return Math.trunc((left * right) / permilleOne);
}

/**
 * The trait records of an entity in its stored order (empty without a `Traits` component).
 *
 * @param content - Content with the trait table.
 * @param entity - Entity to read.
 * @returns The records; unknown trait ids throw `UnknownContentError`.
 */
export function traitsOf(content: SkillContentView, entity: Entity): TraitContent[] {
  const ids = getComponent(entity, traitsComponent)?.ids ?? [];
  return ids.map((id) => content.traits.require(id));
}

/**
 * Whether a trait modifier's skill reference covers a skill. A skill id matches itself, `ALL` and
 * `ALL_WORK` match every skill and unskilled work (`null`), `ALL_CRAFTING` matches the skills that
 * some recipe uses (D-20 wildcard, D-37). `ALL` does not match unskilled work.
 *
 * @param content - Content with the recipe table (for `ALL_CRAFTING`).
 * @param reference - Skill id or wildcard authored in the trait.
 * @param skillId - Skill of the work, or null for work without a skill.
 * @returns True when the modifier applies.
 */
export function modifierCoversSkill(
  content: SkillContentView,
  reference: string,
  skillId: string | null,
): boolean {
  if (reference === SkillWildcard.Work) {
    return true;
  }
  if (skillId === null) {
    return false;
  }
  if (reference === SkillWildcard.All || reference === skillId) {
    return true;
  }
  return (
    reference === SkillWildcard.Crafting &&
    content.recipes.all().some((recipe) => recipe.skillId === skillId)
  );
}

/**
 * Growth multiplier of all aptitude traits for one skill: the permille product, truncated after
 * every factor (D-20). Traits stack multiplicatively; conflicting traits both apply.
 *
 * @param content - Content with trait and recipe tables.
 * @param entity - Entity whose traits are read.
 * @param skillId - Skill that grows.
 * @returns Permille, 1000 when no trait applies.
 */
export function aptitudeMultiplierPermille(
  content: SkillContentView,
  entity: Entity,
  skillId: string,
): number {
  let total = permilleOne;
  for (const trait of traitsOf(content, entity)) {
    for (const modifier of trait.modifiers) {
      if (
        modifier.kind === TraitModifierKind.SkillAptitude &&
        modifierCoversSkill(content, modifier.skill, skillId)
      ) {
        total = productPermille(total, modifier.growthMultiplier);
      }
    }
  }
  return total;
}

/**
 * Combined performance modifier of all traits for one skill and stat (D-20). `Multiplier` and
 * `SpeedMultiplier` combine multiplicatively (start 1000, so a result is a permille factor);
 * `OutputBonus` and `MarginAdd` combine additively (start 0, so a result is a permille amount,
 * e.g. 50 = +0.05).
 *
 * @param content - Content with trait and recipe tables.
 * @param entity - Entity whose traits are read.
 * @param skillId - Skill of the work (`null` for unskilled work).
 * @param stat - Which stat to combine.
 * @returns Permille factor or amount.
 */
export function traitPerformance(
  content: SkillContentView,
  entity: Entity,
  skillId: string | null,
  stat: PerformanceStat,
): number {
  const additive = stat === PerformanceStat.OutputBonus || stat === PerformanceStat.MarginAdd;
  let total = additive ? 0 : permilleOne;
  for (const trait of traitsOf(content, entity)) {
    for (const modifier of trait.modifiers) {
      if (
        modifier.kind === TraitModifierKind.Performance &&
        modifier.stat === stat &&
        modifierCoversSkill(content, modifier.skill, skillId)
      ) {
        total = additive ? total + modifier.value : productPermille(total, modifier.value);
      }
    }
  }
  return total;
}

/**
 * Permille added to a trade's minimum margin rate by the entity's traits (Greedy: +50) and by its
 * `trade_margin` trading skill effect (D-90), the hook of DECISIONS D-12
 * (`marginRate = minimumMarginRate + traitMarginAdd`).
 *
 * @param content - Content with trait and recipe tables.
 * @param entity - Trading entity.
 * @returns Permille to add, 0 without margin traits.
 */
export function marginAddPermille(content: SkillContentView, entity: Entity): number {
  return (
    traitPerformance(content, entity, tradingSkillId, PerformanceStat.MarginAdd) +
    skillEffectMilli(content, entity, tradingSkillId, SkillEffectKind.TradeMargin)
  );
}

/**
 * Combined effect of all need-modifier traits on one need, for the needs and mood systems.
 *
 * @param content - Content with the trait table.
 * @param entity - Entity whose traits are read.
 * @param needId - Need id, or `mood` for the mood pseudo need.
 * @returns The totals; identity values when no trait touches the need.
 */
export function needModifiers(
  content: SkillContentView,
  entity: Entity,
  needId: string,
): NeedModifierTotals {
  const totals: NeedModifierTotals = {
    decayRateMultiplierPermille: permilleOne,
    satisfactionBonusMultiplierPermille: permilleOne,
    moodBonusMilli: 0,
  };
  for (const trait of traitsOf(content, entity)) {
    for (const modifier of trait.modifiers) {
      if (modifier.kind === TraitModifierKind.NeedModifier && modifier.need === needId) {
        totals.decayRateMultiplierPermille = productPermille(
          totals.decayRateMultiplierPermille,
          modifier.decayRateMultiplier,
        );
        totals.satisfactionBonusMultiplierPermille = productPermille(
          totals.satisfactionBonusMultiplierPermille,
          modifier.satisfactionBonusMultiplier,
        );
        totals.moodBonusMilli += modifier.moodBonus;
      }
    }
  }
  return totals;
}
