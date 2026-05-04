import { z } from "zod";

export const FactionMembershipCriteriaSchema = z.object({
  skillId: z.string().min(1),
  minLevel: z.number().int().min(0),
});

export const FactionMechanicsSchema = z.object({
  tradeDiscount: z.number().optional(),
  faithBonus: z.number().optional(),
  titheRate: z.number().optional(),
});

export const FactionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  factionType: z.string().min(1),
  leaderTitle: z.string().min(1),
  disposition: z.string().min(1),
  membershipCriteria: FactionMembershipCriteriaSchema.optional(),
  associatedZones: z.array(z.string()).optional(),
  mechanics: FactionMechanicsSchema.optional(),
  description: z.string().optional(),
});

export type Faction = z.infer<typeof FactionSchema>;
