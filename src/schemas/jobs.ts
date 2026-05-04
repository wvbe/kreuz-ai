import { z } from 'zod';

export const JobTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  skillDomain: z.string().optional(),
  toolRequired: z.string().optional(),
  zoneContext: z.string().optional(),
  recurrence: z.enum(['one-time', 'recurring']),
  description: z.string().optional(),
});

export type JobType = z.infer<typeof JobTypeSchema>;
