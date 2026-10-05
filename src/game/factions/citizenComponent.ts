import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import type { CitizenData } from "./factionTypes";

/**
 * Strict Zod schema of the serialized {@link CitizenData}: faction ids ascending and unique.
 */
export const citizenDataSchema = z
  .object({
    factions: z.array(z.number().int().min(1)),
    homeDwellingId: z.number().int().min(1).nullable(),
    homeAssignedTick: z.number().int().min(0),
  })
  .strict()
  .refine(
    (data) =>
      data.factions.every((id, index) => index === 0 || (data.factions[index - 1] ?? 0) < id),
    { message: "factions must be unique and ascending" },
  );

/**
 * The `Citizen` component (spec 021 FR-002): membership list and home fields. Default: no
 * factions, no home.
 */
export const citizenComponent = defineComponent<"Citizen", CitizenData>(
  "Citizen",
  citizenDataSchema,
  () => ({ factions: [], homeDwellingId: null, homeAssignedTick: 0 }),
);
