import { z } from 'zod';

export const RecipeInputSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().int().min(1),
});

export const RecipeOutputSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().int().min(1),
});

export const RecipeRestrictionsSchema = z.object({
  workstation: z.string().optional(),
  room: z.string().optional(),
  skill: z.object({
    skillId: z.string().min(1),
    minLevel: z.number().int().min(0).optional(),
  }).optional(),
});

export const RecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inputs: z.array(RecipeInputSchema).min(1),
  outputs: z.array(RecipeOutputSchema).min(1),
  durationTicks: z.number().int().positive(),
  restrictions: RecipeRestrictionsSchema,
  outputDestination: z.enum(['workstation', 'crafter', 'stockpile']),
  skillExperienceAwarded: z.object({
    skillId: z.string().min(1),
    amount: z.number().positive(),
  }).optional(),
});

export type Recipe = z.infer<typeof RecipeSchema>;
