import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { TitleRank } from "./identityTypes";
import type { IdentityData } from "./identityTypes";

const contentId = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Strict Zod schema of the serialized {@link IdentityData}; `seenSkills` is ascending and unique.
 */
export const identityDataSchema = z
  .object({
    givenName: z.string(),
    byname: z.string().nullable(),
    nameOrdinal: z.number().int().min(0),
    nameListId: z.string().regex(contentId),
    titleSnapshot: z
      .object({
        skillId: z.string().regex(contentId),
        rank: z.enum(TitleRank),
        noun: z.string().min(1),
        guildId: z.string().regex(contentId).nullable(),
      })
      .strict()
      .nullable(),
    seenSkills: z.array(z.string().regex(contentId)),
  })
  .strict()
  .refine(
    (data) =>
      data.seenSkills.every(
        (skillId, index) => index === 0 || (data.seenSkills[index - 1] ?? "") < skillId,
      ),
    { message: "seenSkills must be unique and ascending" },
  );

/**
 * The `Identity` component (spec 028 FR-003): names as strings, the name ordinal, the name list
 * used, the title snapshot and the skills seen at work. Default: unnamed, common list.
 */
export const identityComponent = defineComponent<"Identity", IdentityData>(
  "Identity",
  identityDataSchema,
  () => ({
    givenName: "",
    byname: null,
    nameOrdinal: 0,
    nameListId: "common_13c",
    titleSnapshot: null,
    seenSkills: [],
  }),
);
