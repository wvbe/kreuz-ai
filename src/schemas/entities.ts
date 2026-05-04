import { z } from "zod";

export const StartingSkillSchema = z.object({
  skillId: z.string().min(1),
  level: z.number().int().min(0).max(100),
});

export const DefaultEquipmentSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
});

export const EntityProductSchema = z.object({
  materialId: z.string().min(1),
  method: z.enum(["periodic", "butcher"]),
  intervalTicks: z.number().int().positive().optional(),
});

export const EntityDropSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().int().min(1),
});

export const EntityPrototypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  entityType: z.enum(["humanoid", "livestock", "wild_animal"]),
  startingSkills: z.array(StartingSkillSchema),
  defaultTraits: z.array(z.string()).optional(),
  traitSlots: z.number().int().min(0).max(5).optional(),
  defaultEquipment: z.array(DefaultEquipmentSchema),
  defaultFactions: z.array(z.string()).optional(),
  behaviorTree: z.string().min(1),
  sellsItems: z.boolean().optional(),
  needPriorityOrder: z.array(z.string()).optional(),
  products: z.array(EntityProductSchema).optional(),
  drops: z.array(EntityDropSchema).optional(),
  habitat: z.array(z.string()).optional(),
  threatLevel: z
    .enum(["none", "low", "medium", "high", "very_high"])
    .optional(),
});

export type EntityPrototype = z.infer<typeof EntityPrototypeSchema>;
