import { z } from "zod";

export const ConstructionCostSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().int().min(1),
});

export const FurnitureEffectSchema = z.object({
  type: z.enum(["activity.unlock", "entity.modifier"]),
  activityId: z.string().optional(),
  modifier: z.string().optional(),
  value: z.number().optional(),
});

export const InventoryFilterSchema = z.object({
  categories: z.array(z.string()).optional(),
  materialIds: z.array(z.string()).optional(),
});

export const FurnitureSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    categories: z.array(z.string()).min(1),
    hasInventory: z.boolean(),
    inventorySlots: z.number().int().min(1).optional(),
    inventoryWeightLimit: z.number().min(1).optional(),
    inventoryFilter: InventoryFilterSchema.optional(),
    constructionCost: z.array(ConstructionCostSchema).min(1),
    effects: z.array(FurnitureEffectSchema).optional(),
  })
  .refine(
    (f) =>
      !f.hasInventory ||
      (f.inventorySlots !== undefined && f.inventoryWeightLimit !== undefined),
    {
      message:
        "inventorySlots and inventoryWeightLimit required when hasInventory is true",
    },
  );

export type Furniture = z.infer<typeof FurnitureSchema>;
