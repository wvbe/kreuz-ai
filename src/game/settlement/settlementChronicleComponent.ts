import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import type { SettlementChronicleData } from "./settlementTypes";

const idSchema = z.number().int().min(1);
const tickSchema = z.number().int().min(0);

/**
 * Strict Zod schema of the serialized {@link SettlementChronicleData}.
 */
export const settlementChronicleSchema = z
  .object({
    moments: z.array(
      z
        .object({
          momentId: idSchema,
          tick: tickSchema,
          kind: z.string().min(1),
          prominence: z.string().min(1),
          entityId: idSchema.nullable(),
          nameSnapshot: z.string().nullable(),
          params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
        })
        .strict(),
    ),
    finest: z.array(
      z
        .object({
          skillId: z.string().min(1),
          entityId: idSchema,
          level: tickSchema,
          sinceTick: tickSchema,
          lastAnnouncedTick: tickSchema,
        })
        .strict(),
    ),
    nextMomentId: idSchema,
  })
  .strict();

/**
 * The `SettlementChronicle` component (spec 028 FR-018) on the player government faction: the
 * Major moments in recording order, the finest-holder table and the next moment id. Task 4.4
 * creates and saves the empty record; the chronicle task (4.6) records into it.
 */
export const settlementChronicleComponent = defineComponent<
  "SettlementChronicle",
  SettlementChronicleData
>("SettlementChronicle", settlementChronicleSchema, () => ({
  moments: [],
  finest: [],
  nextMomentId: 1,
}));
