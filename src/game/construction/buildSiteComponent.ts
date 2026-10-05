import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { maxSitePriority, SiteKind, SiteStatus } from "./constructionTypes";
import type { BuildSiteData } from "./constructionTypes";

const idSchema = z.number().int().min(1);
const tickSchema = z.number().int().min(0);

/**
 * Strict Zod schema of one material of a build site.
 */
export const siteMaterialSchema = z
  .object({ materialId: z.string().min(1), quantity: idSchema })
  .strict();

/**
 * Strict Zod schema of the serialized {@link BuildSiteData}: the live statuses only (a finished
 * site has no entity), progress within the duration, a builder only while building.
 */
export const buildSiteDataSchema = z
  .object({
    kind: z.nativeEnum(SiteKind),
    prototypeId: z.string(),
    status: z.enum([SiteStatus.Planned, SiteStatus.Supplying, SiteStatus.Building]),
    required: z.array(siteMaterialSchema),
    progress: tickSchema,
    durationTicks: tickSchema,
    builderId: idSchema.nullable(),
    startedTick: tickSchema.nullable(),
    supplierId: idSchema.nullable(),
    postingId: idSchema.nullable(),
    priority: z.number().int().min(0).max(maxSitePriority),
    urgent: z.boolean(),
    paused: z.boolean(),
    blockedMaterialId: z.string().min(1).nullable(),
    targetEntityId: idSchema.nullable(),
    ownerFactionId: idSchema.nullable(),
    createdTick: tickSchema,
  })
  .strict()
  .refine((data) => data.progress <= data.durationTicks, {
    message: "progress cannot exceed the duration",
  })
  .refine((data) => data.builderId === null || data.status === SiteStatus.Building, {
    message: "only a site in the building status has a builder",
  })
  .refine((data) => data.builderId !== null || data.startedTick === null, {
    message: "a start tick needs a builder",
  });

/**
 * The `BuildSite` component (spec 016, DECISIONS D-27): the blueprint on a cell, with the job
 * state. It lives in the entities save section, so a save in the middle of construction resumes
 * with the same delivered materials (the site's `Inventory`), progress and builder. The
 * `build_site` prototype carries it.
 */
export const buildSiteComponent = defineComponent<"BuildSite", BuildSiteData>(
  "BuildSite",
  buildSiteDataSchema,
  () => ({
    kind: SiteKind.Construct,
    prototypeId: "",
    status: SiteStatus.Planned,
    required: [],
    progress: 0,
    durationTicks: 0,
    builderId: null,
    startedTick: null,
    supplierId: null,
    postingId: null,
    priority: 50,
    urgent: false,
    paused: false,
    blockedMaterialId: null,
    targetEntityId: null,
    ownerFactionId: null,
    createdTick: 0,
  }),
);
