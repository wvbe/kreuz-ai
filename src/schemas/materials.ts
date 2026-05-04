import { z } from "zod";

export const MaterialSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    categories: z.array(z.string()).min(1),
    stackLimit: z.number().int().min(1).max(1000),
    weight: z.number().min(1),
    perishable: z.boolean(),
    perishTicks: z.number().int().positive().optional(),
    value: z.number().min(0),
  })
  .refine(
    (m) => !m.perishable || (m.perishTicks !== undefined && m.perishTicks > 0),
    { message: "perishTicks required and > 0 when perishable is true" },
  );

export type Material = z.infer<typeof MaterialSchema>;
