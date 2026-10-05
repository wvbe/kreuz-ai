import { z } from "zod";
import { defineComponent } from "../../ecs/ComponentRegistry";
import { maxMeterMilli, maxMoodInfluences, neutralMoodMilli } from "../aiTypes";
import type { MoodData } from "../aiTypes";

/**
 * Strict Zod schema of the serialized {@link MoodData}: value `0..100000`, at most
 * {@link maxMoodInfluences} influences.
 */
export const moodDataSchema = z
  .object({
    valueMilli: z.number().int().min(0).max(maxMeterMilli),
    influences: z
      .array(
        z
          .object({
            source: z.string().min(1),
            deltaMilli: z.number().int(),
            untilTick: z.number().int().min(0),
          })
          .strict(),
      )
      .max(maxMoodInfluences),
  })
  .strict();

/**
 * The `Mood` component (spec 013 FR-004, DECISIONS D-25): current mood in milli-percent and the
 * bounded list of recent influences. Not a need. Default: neutral (50 percent), no influences.
 */
export const moodComponent = defineComponent<"Mood", MoodData>("Mood", moodDataSchema, () => ({
  valueMilli: neutralMoodMilli,
  influences: [],
}));
