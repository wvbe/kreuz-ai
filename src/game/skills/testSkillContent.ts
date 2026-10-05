import { loadContent } from "../content/ContentLoader";
import { ContentTable } from "../content/ContentTable";
import { PerformanceStat, SkillEffectKind, TraitModifierKind } from "../content/contentTypes";
import type { SkillContent, TraitContent } from "../content/schemas/characterSchemas";
import type { Entity } from "../ecs/Entity";
import type { SkillContentView } from "./skillTypes";

function skill(id: string, effects: SkillContent["outcomeEffects"]): SkillContent {
  return {
    id,
    name: id,
    baseGrowthPerCompletion: 2000,
    diminishingReturnsThreshold: 50,
    diminishingFactor: 250,
    outcomeEffects: effects,
    titleNoun: id,
  };
}

/**
 * Skills of the test content: `baking` (speed 0.5 and output 1.0), `construction` and `hauling`
 * (speed 0.5), `trading` and `glassblowing` (quality only). Growth 2.0, threshold 50, factor 0.25.
 */
export const testSkills: readonly SkillContent[] = [
  skill("baking", [
    { kind: SkillEffectKind.MaxSpeedBonus, value: 500 },
    { kind: SkillEffectKind.OutputBonus, value: 1000 },
  ]),
  skill("construction", [{ kind: SkillEffectKind.MaxSpeedBonus, value: 500 }]),
  skill("glassblowing", [{ kind: SkillEffectKind.QualityBonus, value: 500 }]),
  skill("hauling", [{ kind: SkillEffectKind.MaxSpeedBonus, value: 500 }]),
  skill("trading", [{ kind: SkillEffectKind.QualityBonus, value: 500 }]),
];

/**
 * Traits of the test content: `gifted_baker` (baking x1.5, starts at +10), `quick_learner` (ALL
 * x1.2), `slow_learner` (ALL x0.8, conflicts with quick_learner), `heavy_handed` (construction
 * speed x0.8), `strong` (hauling multiplier x1.3), `fast_hands` (ALL_WORK speed x1.1), `greedy`
 * (trading margin +0.05), `crafty` (ALL_CRAFTING extra output +0.5), `hearty` (hunger decay x0.8,
 * satisfaction x1.2, mood +5).
 */
export const testTraits: readonly TraitContent[] = [
  {
    id: "gifted_baker",
    name: "Gifted baker",
    modifiers: [
      {
        kind: TraitModifierKind.SkillAptitude,
        skill: "baking",
        growthMultiplier: 1500,
        startingValueBonus: 10_000,
      },
    ],
    conflictsWith: [],
  },
  {
    id: "quick_learner",
    name: "Quick learner",
    modifiers: [
      {
        kind: TraitModifierKind.SkillAptitude,
        skill: "ALL",
        growthMultiplier: 1200,
        startingValueBonus: 0,
      },
    ],
    conflictsWith: [],
  },
  {
    id: "slow_learner",
    name: "Slow learner",
    modifiers: [
      {
        kind: TraitModifierKind.SkillAptitude,
        skill: "ALL",
        growthMultiplier: 800,
        startingValueBonus: 0,
      },
    ],
    conflictsWith: ["quick_learner"],
  },
  {
    id: "heavy_handed",
    name: "Heavy handed",
    modifiers: [
      {
        kind: TraitModifierKind.Performance,
        skill: "construction",
        stat: PerformanceStat.SpeedMultiplier,
        value: 800,
      },
    ],
    conflictsWith: [],
  },
  {
    id: "strong",
    name: "Strong",
    modifiers: [
      {
        kind: TraitModifierKind.Performance,
        skill: "hauling",
        stat: PerformanceStat.Multiplier,
        value: 1300,
      },
    ],
    conflictsWith: [],
  },
  {
    id: "fast_hands",
    name: "Fast hands",
    modifiers: [
      {
        kind: TraitModifierKind.Performance,
        skill: "ALL_WORK",
        stat: PerformanceStat.SpeedMultiplier,
        value: 1100,
      },
    ],
    conflictsWith: [],
  },
  {
    id: "greedy",
    name: "Greedy",
    modifiers: [
      {
        kind: TraitModifierKind.Performance,
        skill: "trading",
        stat: PerformanceStat.MarginAdd,
        value: 50,
      },
    ],
    conflictsWith: [],
  },
  {
    id: "crafty",
    name: "Crafty",
    modifiers: [
      {
        kind: TraitModifierKind.Performance,
        skill: "ALL_CRAFTING",
        stat: PerformanceStat.OutputBonus,
        value: 500,
      },
    ],
    conflictsWith: [],
  },
  {
    id: "hearty",
    name: "Hearty",
    modifiers: [
      {
        kind: TraitModifierKind.NeedModifier,
        need: "hunger",
        decayRateMultiplier: 800,
        satisfactionBonusMultiplier: 1200,
        moodBonus: 5000,
      },
    ],
    conflictsWith: [],
  },
];

/**
 * Builds a small content view for pure-function tests: the tables above plus the recipes of the
 * bundled pack (`baking` and others are recipe skills, so `ALL_CRAFTING` covers them).
 *
 * @returns The content view.
 */
export function createTestSkillContent(): SkillContentView {
  return {
    skills: new ContentTable("skills", structuredClone(testSkills), (record) => record.id),
    traits: new ContentTable("traits", structuredClone(testTraits), (record) => record.id),
    recipes: loadContent().recipes,
  };
}

/**
 * Builds a character entity with `Skills` and `Traits` components, no engine needed.
 *
 * @param skills - Skill levels `0..100` by skill id (stored as milli-percent).
 * @param traitIds - Trait ids.
 * @param id - Entity id, default 1.
 * @returns A live entity object.
 */
export function createTestCharacter(
  skills: { readonly [skillId: string]: number },
  traitIds: readonly string[] = [],
  id = 1,
): Entity {
  return {
    id,
    prototype: "peasant",
    components: {
      Skills: {
        values: Object.fromEntries(
          Object.entries(skills).map(([skillId, level]) => [skillId, level * 1000]),
        ),
      },
      Traits: { ids: [...traitIds] },
    },
  };
}
