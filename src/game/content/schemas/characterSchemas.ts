import { z } from "zod";
import {
  AnimalKind,
  FactionType,
  SeatSide,
  NeedSatisfactionKind,
  PerformanceStat,
  SkillEffectKind,
  SkillWildcard,
  TraitModifierKind,
} from "../contentTypes";
import {
  contentIdSchema,
  countSchema,
  fractionSchema,
  levelSchema,
  materialAmountSchema,
  milliSchema,
  percentSchema,
  permilleSchema,
  positiveSchema,
} from "./fieldSchemas";

/**
 * Authored need (spec 022 need record). `decayPerTick`, `criticalThreshold` and the satisfaction
 * `amount`s are percent points of the 0..100 need scale, stored as milli-percent (D-04).
 */
export const needSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    decayPerTick: milliSchema,
    criticalThreshold: percentSchema,
    satisfactionMethods: z
      .array(
        z
          .object({
            kind: z.enum(NeedSatisfactionKind),
            ref: contentIdSchema,
            amount: milliSchema,
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

/**
 * Loaded need record.
 */
export type NeedContent = z.infer<typeof needSchema>;

/**
 * Authored skill (spec 022 skill record, spec 020). `baseGrowthPerCompletion` is milli skill
 * points, `diminishingFactor` and effect values are permille multipliers.
 */
export const skillSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    baseGrowthPerCompletion: milliSchema,
    diminishingReturnsThreshold: levelSchema,
    diminishingFactor: fractionSchema,
    outcomeEffects: z
      .array(z.object({ kind: z.enum(SkillEffectKind), value: permilleSchema }).strict())
      .min(1),
    titleNoun: z.string().min(1),
  })
  .strict();

/**
 * Loaded skill record.
 */
export type SkillContent = z.infer<typeof skillSchema>;

const skillRefSchema = z.union([z.enum(SkillWildcard), contentIdSchema]);

const traitModifierSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal(TraitModifierKind.SkillAptitude),
      skill: z.union([z.literal(SkillWildcard.All), contentIdSchema]),
      growthMultiplier: permilleSchema,
      startingValueBonus: milliSchema.default(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal(TraitModifierKind.Performance),
      skill: skillRefSchema,
      stat: z.enum(PerformanceStat),
      value: permilleSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal(TraitModifierKind.NeedModifier),
      need: contentIdSchema,
      decayRateMultiplier: permilleSchema.default(1000),
      satisfactionBonusMultiplier: permilleSchema.default(1000),
      moodBonus: milliSchema.default(0),
    })
    .strict(),
]);

/**
 * Authored trait (spec 022 trait record, DECISIONS D-37): a list of modifiers of three kinds and
 * the ids of traits it never shares a character with (the procedural draw skips them, D-20).
 */
export const traitSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    modifiers: z.array(traitModifierSchema).min(1),
    conflictsWith: z.array(contentIdSchema).default([]),
  })
  .strict();

/**
 * Loaded trait record.
 */
export type TraitContent = z.infer<typeof traitSchema>;

/**
 * Authored humanoid prototype (spec 022 humanoid record). `startingSkills` are levels on the
 * 0..100 scale and are stored as milli-percent; `needPriority` overrides the default order.
 */
export const humanoidPrototypeSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    startingSkills: z
      .record(contentIdSchema, levelSchema)
      .default({})
      .transform((skills) =>
        Object.fromEntries(Object.entries(skills).map(([skill, level]) => [skill, level * 1000])),
      ),
    equipment: z.array(materialAmountSchema).default([]),
    defaultFactionIds: z.array(contentIdSchema).default([]),
    defaultTraitIds: z.array(contentIdSchema).default([]),
    traitSlots: z.number().int().min(1).max(3).default(2),
    needPriority: z.array(contentIdSchema).optional(),
    sellsItems: z.boolean().default(false),
    nameListId: contentIdSchema.default("common_13c"),
    givenName: z.string().min(1).optional(),
    byname: z.string().min(1).optional(),
    inventorySlots: positiveSchema.default(8),
    behaviorTreeId: contentIdSchema,
  })
  .strict()
  .refine((prototype) => prototype.defaultTraitIds.length <= prototype.traitSlots, {
    message: "defaultTraitIds exceeds traitSlots",
    path: ["defaultTraitIds"],
  });

/**
 * Loaded humanoid prototype record.
 */
export type HumanoidPrototypeContent = z.infer<typeof humanoidPrototypeSchema>;

/**
 * Authored animal prototype (spec 022 animal record).
 */
export const animalPrototypeSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    kind: z.enum(AnimalKind),
    products: z.array(materialAmountSchema).default([]),
    drops: z.array(materialAmountSchema).default([]),
    tendingSkillId: contentIdSchema.optional(),
    zoneId: contentIdSchema.optional(),
    habitatTerrainIds: z.array(contentIdSchema).default([]),
    behaviorTreeId: contentIdSchema,
    threatLevel: countSchema.default(0),
  })
  .strict();

/**
 * Loaded animal prototype record.
 */
export type AnimalPrototypeContent = z.infer<typeof animalPrototypeSchema>;

/**
 * How a faction that lives off the map takes part in the world (spec 021, DECISIONS D-56): the map
 * edge of its seat, how each side sees the other at the start and the weights of the acts its AI
 * may choose (0 = never).
 */
export const npcFactionSchema = z
  .object({
    side: z.enum(SeatSide),
    standingTowardSettlement: z.number().int().min(-100).max(100).default(0),
    settlementStandingToward: z.number().int().min(-100).max(100).default(0),
    overtureWeight: countSchema.default(0),
    agreementWeight: countSchema.default(0),
    incidentWeight: countSchema.default(0),
    warLike: z.boolean().default(false),
  })
  .strict();

/**
 * Authored faction (spec 022 faction record, spec 021). `masterSkillThreshold` must exceed the
 * membership minimum.
 */
export const factionSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    factionType: z.enum(FactionType),
    leaderTitle: z.string().min(1),
    disposition: contentIdSchema,
    membership: z.object({ skillId: contentIdSchema, minLevel: levelSchema }).strict().optional(),
    masterSkillThreshold: levelSchema.default(60),
    associatedZoneIds: z.array(contentIdSchema).default([]),
    npc: npcFactionSchema.optional(),
  })
  .strict()
  .refine(
    (faction) =>
      faction.membership === undefined ||
      faction.masterSkillThreshold > faction.membership.minLevel,
    {
      message: "masterSkillThreshold must exceed membership.minLevel",
      path: ["masterSkillThreshold"],
    },
  );

/**
 * Loaded faction record.
 */
export type FactionContent = z.infer<typeof factionSchema>;

/**
 * Authored name list (spec 022 FR-021): weighted given names and bynames without duplicates.
 */
export const nameListSchema = z
  .object({
    id: contentIdSchema,
    givenNames: z
      .array(z.object({ name: z.string().min(1), weight: positiveSchema }).strict())
      .min(1),
    bynames: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((list, context) => {
    const given = list.givenNames.map((entry) => entry.name.toLowerCase());
    if (new Set(given).size !== given.length) {
      context.addIssue({ code: "custom", path: ["givenNames"], message: "duplicate given name" });
    }
    const bynames = list.bynames.map((entry) => entry.toLowerCase());
    if (new Set(bynames).size !== bynames.length) {
      context.addIssue({ code: "custom", path: ["bynames"], message: "duplicate byname" });
    }
  });

/**
 * Loaded name list record.
 */
export type NameListContent = z.infer<typeof nameListSchema>;
