import { z } from "zod";
import { DwellingLevel } from "../content/contentTypes";
import { defineComponent } from "../ecs/ComponentRegistry";
import type { DwellingData } from "./housingTypes";

const countSchema = z.number().int().min(0);

/**
 * Strict Zod schema of the serialized {@link DwellingData}: integer counters and milli-units,
 * food days as whole game days.
 */
export const dwellingDataSchema = z
  .object({
    level: z.enum(DwellingLevel),
    upgradeStreak: countSchema,
    downgradeStreak: countSchema,
    consumptionAccumulators: z.record(z.string().min(1), countSchema),
    foodRecord: z.record(z.string().min(1), countSchema),
    lastEvaluatedDay: countSchema.nullable(),
  })
  .strict();

/**
 * The `Dwelling` component (spec 029 FR-004) on a zone entity of type `dwelling`: level, the two
 * streaks, the supplied-good accumulators, the food record and the day of the last evaluation. The
 * default is a Hovel with empty counters.
 */
export const dwellingComponent = defineComponent<"Dwelling", DwellingData>(
  "Dwelling",
  dwellingDataSchema,
  () => ({
    level: DwellingLevel.Hovel,
    upgradeStreak: 0,
    downgradeStreak: 0,
    consumptionAccumulators: {},
    foodRecord: {},
    lastEvaluatedDay: null,
  }),
);
