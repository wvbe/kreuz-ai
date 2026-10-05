import { hasComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import { PerformanceStat, TraitModifierKind } from "../content/contentTypes";
import type { TraitContent } from "../content/schemas/characterSchemas";
import { dominantSkill, levelOfMilli, skillValueMilli } from "./skillLevels";
import { skillsComponent, traitsComponent } from "./skillsComponent";
import type { SkillContentView } from "./skillTypes";
import { traitsOf } from "./traitModifiers";

/**
 * One skill row of {@link SkillsView}.
 */
export type SkillRowView = {
  readonly skillId: string;
  readonly name: string;
  /**
   * Integer level `0..100`.
   */
  readonly level: number;
  /**
   * Accumulated experience, milli-percent `0..100000`.
   */
  readonly valueMilli: number;
};

/**
 * Skill profile of one entity (spec 020 US6): every registered skill, ascending by id, and the
 * dominant skill (null when all are 0).
 */
export type SkillsView = {
  readonly entityId: number;
  readonly dominantSkill: string | null;
  readonly skills: readonly SkillRowView[];
};

/**
 * One trait row of {@link TraitsView}.
 */
export type TraitRowView = {
  readonly traitId: string;
  readonly name: string;
  /**
   * Human readable effect descriptions, one per modifier.
   */
  readonly effects: readonly string[];
};

/**
 * Trait list of one entity (spec 020 US3/US6).
 */
export type TraitsView = {
  readonly entityId: number;
  readonly traits: readonly TraitRowView[];
};

/**
 * Formats a permille integer as a short decimal without floats (`1500` as `1.5`, `800` as `0.8`).
 *
 * @param permille - Integer permille.
 * @returns The decimal text.
 */
export function formatPermille(permille: number): string {
  const sign = permille < 0 ? "-" : "";
  const absolute = Math.abs(permille);
  const fraction = String(absolute % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${sign}${Math.floor(absolute / 1000)}${fraction === "" ? "" : `.${fraction}`}`;
}

const statLabels: { readonly [stat in PerformanceStat]: string } = {
  [PerformanceStat.Multiplier]: "performance",
  [PerformanceStat.OutputBonus]: "extra output",
  [PerformanceStat.SpeedMultiplier]: "speed",
  [PerformanceStat.MarginAdd]: "trade margin",
};

/**
 * Describes each modifier of a trait in one line, e.g. `learns baking x1.5, starts at +10`.
 *
 * @param trait - Trait record.
 * @returns One description per modifier, in file order.
 */
export function describeTrait(trait: TraitContent): string[] {
  return trait.modifiers.map((modifier) => {
    switch (modifier.kind) {
      case TraitModifierKind.SkillAptitude: {
        const bonus =
          modifier.startingValueBonus > 0
            ? `, starts at +${formatPermille(modifier.startingValueBonus)}`
            : "";
        return `learns ${modifier.skill} x${formatPermille(modifier.growthMultiplier)}${bonus}`;
      }
      case TraitModifierKind.Performance: {
        const amount =
          modifier.stat === PerformanceStat.OutputBonus ||
          modifier.stat === PerformanceStat.MarginAdd
            ? `+${formatPermille(modifier.value)}`
            : `x${formatPermille(modifier.value)}`;
        return `${modifier.skill} ${statLabels[modifier.stat]} ${amount}`;
      }
      case TraitModifierKind.NeedModifier: {
        const parts = [`${modifier.need}`];
        if (modifier.decayRateMultiplier !== 1000) {
          parts.push(`decay x${formatPermille(modifier.decayRateMultiplier)}`);
        }
        if (modifier.satisfactionBonusMultiplier !== 1000) {
          parts.push(`satisfaction x${formatPermille(modifier.satisfactionBonusMultiplier)}`);
        }
        if (modifier.moodBonus !== 0) {
          parts.push(`mood +${formatPermille(modifier.moodBonus)}`);
        }
        return parts.join(" ");
      }
    }
  });
}

/**
 * Builds the skill profile of an entity: all registered skills with their current values (no
 * cache, reads the live component) and the dominant skill.
 *
 * @param content - Content with the skill table.
 * @param entity - Entity to describe.
 * @returns The view, or null when the entity has no `Skills` component.
 */
export function buildSkillsView(content: SkillContentView, entity: Entity): SkillsView | null {
  if (!hasComponent(entity, skillsComponent)) {
    return null;
  }
  return {
    entityId: entity.id,
    dominantSkill: dominantSkill(entity),
    skills: content.skills.ids().map((skillId) => {
      const valueMilli = skillValueMilli(entity, skillId);
      return {
        skillId,
        name: content.skills.require(skillId).name,
        level: levelOfMilli(valueMilli),
        valueMilli,
      };
    }),
  };
}

/**
 * Builds the trait list of an entity with names and effect descriptions.
 *
 * @param content - Content with the trait table.
 * @param entity - Entity to describe.
 * @returns The view, or null when the entity has no `Traits` component.
 */
export function buildTraitsView(content: SkillContentView, entity: Entity): TraitsView | null {
  if (!hasComponent(entity, traitsComponent)) {
    return null;
  }
  return {
    entityId: entity.id,
    traits: traitsOf(content, entity).map((trait) => ({
      traitId: trait.id,
      name: trait.name,
      effects: describeTrait(trait),
    })),
  };
}
