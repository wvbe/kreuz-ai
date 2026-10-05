import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { maxStanding, minStanding, politicalFactionType } from "./factionTypes";
import type { FactionData } from "./factionTypes";

const entityIdSchema = z.number().int().min(1);

/**
 * Strict Zod schema of the serialized {@link FactionData}: standing entries ascending by faction
 * id, unique, values in `-100..100`.
 */
export const factionDataSchema = z
  .object({
    contentId: z.string().min(1).nullable(),
    name: z.string(),
    factionType: z.string().min(1),
    leaderTitle: z.string(),
    disposition: z.string().min(1),
    leaderId: entityIdSchema.nullable(),
    standing: z.array(
      z
        .object({
          factionId: entityIdSchema,
          value: z.number().int().min(minStanding).max(maxStanding),
          tradeAgreement: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(
    (data) =>
      data.standing.every(
        (entry, index) =>
          index === 0 || (data.standing[index - 1]?.factionId ?? 0) < entry.factionId,
      ),
    { message: "standing entries must be unique and ascending by factionId" },
  );

/**
 * The `Faction` component (spec 021 FR-001): name, type, leader, directional standing list and
 * disposition. Defaults to an unnamed political faction without leader.
 */
export const factionComponent = defineComponent<"Faction", FactionData>(
  "Faction",
  factionDataSchema,
  () => ({
    contentId: null,
    name: "",
    factionType: politicalFactionType,
    leaderTitle: "",
    disposition: "none",
    leaderId: null,
    standing: [],
  }),
);
