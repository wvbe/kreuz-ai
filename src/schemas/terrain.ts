import { z } from "zod";

export const HarvestableResourceSchema = z.object({
  materialId: z.string().min(1),
});

export const TerrainTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  traversable: z.boolean(),
  movementModifier: z.enum(["slow", "very_slow", "fast"]).optional(),
  buildable: z.boolean(),
  harvestableResources: z.array(HarvestableResourceSchema).optional(),
  clearResult: z.string().optional(),
});

export type TerrainType = z.infer<typeof TerrainTypeSchema>;
