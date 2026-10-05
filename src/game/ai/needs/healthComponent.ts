import { z } from "zod";
import { defineComponent } from "../../ecs/ComponentRegistry";
import { maxMeterMilli } from "../aiTypes";
import type { HealthData } from "../aiTypes";

/**
 * Strict Zod schema of the serialized {@link HealthData}.
 */
export const healthDataSchema = z
  .object({ valueMilli: z.number().int().min(0).max(maxMeterMilli) })
  .strict();

/**
 * The `Health` component (DECISIONS D-25): milli-percent `0..100000`, full by default. Starvation
 * lowers it; at zero the entity dies.
 */
export const healthComponent = defineComponent<"Health", HealthData>(
  "Health",
  healthDataSchema,
  () => ({ valueMilli: maxMeterMilli }),
);
