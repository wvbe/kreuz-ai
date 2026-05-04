import { z } from 'zod';

export const NeedSatisfactionMethodSchema = z.object({
  type: z.enum(['consume', 'use_furniture', 'zone_presence', 'social', 'proximity']),
  materialCategory: z.string().optional(),
  materialId: z.string().optional(),
  satisfactionAmount: z.number().optional(),
  furnitureId: z.string().optional(),
  furnitureTag: z.string().optional(),
  restorationRate: z.number().optional(),
  zoneTypeId: z.string().optional(),
  passiveBonus: z.number().optional(),
  entityTag: z.string().optional(),
  radius: z.number().optional(),
  bonus: z.number().optional(),
});

export const NeedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  decayPerTick: z.number().positive(),
  criticalThreshold: z.number().min(0).max(1),
  satisfactionMethods: z.array(NeedSatisfactionMethodSchema).min(1),
});

export type Need = z.infer<typeof NeedSchema>;
export type NeedSatisfactionMethod = z.infer<typeof NeedSatisfactionMethodSchema>;
