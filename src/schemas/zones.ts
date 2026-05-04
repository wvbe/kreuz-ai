import { z } from 'zod';

export const FurnitureRequirementSchema = z.object({
  furnitureId: z.string().optional(),
  furnitureTag: z.string().optional(),
  count: z.number().int().min(1),
});

export const ZoneEffectSchema = z.object({
  type: z.enum(['activity.unlock', 'entity.modifier']),
  activityId: z.string().optional(),
  modifier: z.string().optional(),
  value: z.number().optional(),
});

export const ZoneTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  requiresRoom: z.boolean(),
  minTiles: z.number().int().min(1),
  furnitureRequirements: z.array(FurnitureRequirementSchema),
  effects: z.array(ZoneEffectSchema),
  professionAffinity: z.string().optional(),
});

export type ZoneType = z.infer<typeof ZoneTypeSchema>;
