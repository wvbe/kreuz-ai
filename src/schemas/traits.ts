import { z } from 'zod';

export const SkillAptitudeModifierSchema = z.object({
  type: z.literal('skillAptitude'),
  skillId: z.string().min(1),
  growthMultiplier: z.number(),
  startingValueBonus: z.number().int().optional(),
});

export const PerformanceModifierSchema = z.object({
  type: z.literal('performanceModifier'),
  domain: z.string().min(1),
  multiplier: z.number(),
  outputBonus: z.number().optional(),
});

export const NeedModifierSchema = z.object({
  type: z.literal('needModifier'),
  needId: z.string().min(1),
  decayRateMultiplier: z.number().optional(),
  satisfactionBonusMultiplier: z.number().optional(),
  flatBonus: z.number().optional(),
  trigger: z.string().optional(),
});

export const TraitModifierSchema = z.discriminatedUnion('type', [
  SkillAptitudeModifierSchema,
  PerformanceModifierSchema,
  NeedModifierSchema,
]);

export const TraitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  modifiers: z.array(TraitModifierSchema).min(1),
});

export type Trait = z.infer<typeof TraitSchema>;
export type TraitModifier = z.infer<typeof TraitModifierSchema>;
