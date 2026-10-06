import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { MilestoneKind, SettlementTier } from "../content/contentTypes";
import type { SettlementProgressData } from "./settlementTypes";

const tickSchema = z.number().int().min(0);
const tierNames: readonly string[] = Object.values(SettlementTier);

/**
 * Strict Zod schema of the serialized {@link SettlementProgressData}: only tiers in the reach
 * table, and the current tier must be in it.
 */
export const settlementProgressSchema = z
  .object({
    tier: z.enum(SettlementTier),
    tierReachedAtTick: z.record(z.string(), tickSchema),
    milestones: z.array(
      z
        .object({
          milestone: z.enum(MilestoneKind),
          tick: tickSchema,
          subjectIds: z.array(z.number().int().min(1)),
        })
        .strict(),
    ),
    evaluations: tickSchema,
    lastEvaluationTick: tickSchema.nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data.tierReachedAtTick).every((tier) => tierNames.includes(tier)), {
    message: "tierReachedAtTick may only name settlement tiers",
  })
  .refine((data) => data.tierReachedAtTick[data.tier] !== undefined, {
    message: "the current tier must have a reach tick",
  })
  .refine(
    (data) =>
      new Set(data.milestones.map((record) => record.milestone)).size === data.milestones.length,
    { message: "a milestone is recorded once" },
  );

/**
 * The `SettlementProgress` component (spec 027 FR-002): the current tier, the tick each tier was
 * reached and the milestones, on the player government faction entity. The default is a Hamlet
 * reached at tick 0 with no milestones.
 */
export const settlementProgressComponent = defineComponent<
  "SettlementProgress",
  SettlementProgressData
>("SettlementProgress", settlementProgressSchema, () => ({
  tier: SettlementTier.Hamlet,
  tierReachedAtTick: { [SettlementTier.Hamlet]: 0 },
  milestones: [],
  evaluations: 0,
  lastEvaluationTick: null,
}));
