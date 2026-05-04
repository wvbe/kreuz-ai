import { z } from "zod";

export const SkillOutcomeEffectSchema = z.object({
  type: z.enum(["speedMultiplier", "outputBonus", "custom"]),
  valueAtMax: z.number(),
  description: z.string().optional(),
});

export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseGrowthPerCompletion: z.number().positive(),
  diminishingReturnsThreshold: z.number().int().min(0).max(100),
  diminishingReturnsFactor: z.number().min(0).max(1),
  outcomeEffects: z.array(SkillOutcomeEffectSchema).min(1),
});

export type Skill = z.infer<typeof SkillSchema>;
export type SkillOutcomeEffect = z.infer<typeof SkillOutcomeEffectSchema>;
