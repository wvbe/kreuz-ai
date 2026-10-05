import { z } from "zod";
import { defineComponent } from "../../ecs/ComponentRegistry";
import { maxMeterMilli } from "../aiTypes";
import type { NeedsData } from "../aiTypes";

/**
 * Strict Zod schema of the serialized {@link NeedsData}: values `0..100000`, ascending and unique
 * by need id.
 */
export const needsDataSchema = z
  .object({
    values: z.array(
      z
        .object({
          needId: z.string().min(1),
          valueMilli: z.number().int().min(0).max(maxMeterMilli),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(
    (data) =>
      data.values.every(
        (value, index) => index === 0 || (data.values[index - 1]?.needId ?? "") < value.needId,
      ),
    { message: "need values must be unique and ascending by need id" },
  );

/**
 * The `Needs` component (spec 013 FR-001, DECISIONS D-25): the level of every need in
 * milli-percent. Default: no needs; the humanoid prototypes list every need of the pack at the
 * start value.
 */
export const needsComponent = defineComponent<"Needs", NeedsData>("Needs", needsDataSchema, () => ({
  values: [],
}));
