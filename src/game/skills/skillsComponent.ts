import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { maxSkillMilli } from "./skillTypes";
import type { SkillsData, TraitsData } from "./skillTypes";

const contentId = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Strict Zod schema of the serialized {@link SkillsData}: content ids mapped to integers in
 * `0..100000`.
 */
export const skillsDataSchema = z
  .object({
    values: z.record(z.string().regex(contentId), z.number().int().min(0).max(maxSkillMilli)),
  })
  .strict();

/**
 * Strict Zod schema of the serialized {@link TraitsData}: unique trait ids.
 */
export const traitsDataSchema = z
  .object({ ids: z.array(z.string().regex(contentId)) })
  .strict()
  .refine((data) => new Set(data.ids).size === data.ids.length, {
    message: "trait ids must be unique",
  });

/**
 * The `Skills` component (spec 020 FR-002): fixed-point experience per skill, default empty.
 */
export const skillsComponent = defineComponent<"Skills", SkillsData>(
  "Skills",
  skillsDataSchema,
  () => ({ values: {} }),
);

/**
 * The `Traits` component (spec 020 FR-004): immutable trait ids, default none.
 */
export const traitsComponent = defineComponent<"Traits", TraitsData>(
  "Traits",
  traitsDataSchema,
  () => ({ ids: [] }),
);
