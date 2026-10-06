import { z } from "zod";
import { materialDefinitionSchema } from "../../inventory/MaterialRegistry";
import { terrainDefinitionSchema } from "../../map/TerrainRegistry";
import { BlockReason, MoveCostClass } from "../../map/mapTypes";
import { FurnitureRefKind, JobRecurrence, SettlementTier, ZoneContextKind } from "../contentTypes";
import {
  contentIdSchema,
  countSchema,
  dottedIdSchema,
  materialAmountSchema,
  milliSchema,
  positiveSchema,
  signedMilliSchema,
} from "./fieldSchemas";

/**
 * Authored material: decimals `weight` and `value` (coins) become milli units, `perishability`
 * is in ticks. The converted record is validated by the inventory module's own
 * `materialDefinitionSchema`, so the loaded value is a `MaterialDefinition`.
 */
export const materialContentSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    categories: z.array(contentIdSchema),
    stackLimit: positiveSchema,
    weight: milliSchema,
    value: milliSchema.optional(),
    perishability: positiveSchema.optional(),
  })
  .strict()
  .transform((material) => ({
    id: material.id,
    name: material.name,
    categories: material.categories,
    stackLimit: material.stackLimit,
    weightMilli: material.weight,
    ...(material.value === undefined ? {} : { valueMilli: material.value }),
    ...(material.perishability === undefined ? {} : { perishabilityTicks: material.perishability }),
  }))
  .pipe(materialDefinitionSchema);

/**
 * Authored item category (`categories.json`, DECISIONS D-15): the closed list that material
 * categories and storage filters must come from.
 */
export const categorySchema = z.object({ id: contentIdSchema, name: z.string().min(1) }).strict();

/**
 * Loaded category record.
 */
export type CategoryContent = z.infer<typeof categorySchema>;

/**
 * A harvestable resource of a terrain: which material and how much one harvest yields.
 */
const harvestableSchema = materialAmountSchema;

/**
 * Authored terrain: the movement fields of the map module's `terrainDefinitionSchema` plus
 * content-only fields (`buildable`, `harvestable`, `clearsTo`, DECISIONS D-15). The registry
 * gets only the `TerrainDefinition` part.
 */
export const terrainContentSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    moveCost: z.enum(MoveCostClass),
    passable: z.boolean(),
    blockReason: z.enum(BlockReason).nullable().default(null),
    buildable: z.boolean(),
    harvestable: z.array(harvestableSchema).default([]),
    clearsTo: contentIdSchema.optional(),
  })
  .strict()
  .superRefine((terrain, context) => {
    const core = terrainDefinitionSchema.safeParse({
      id: terrain.id,
      moveCost: terrain.moveCost,
      passable: terrain.passable,
      blockReason: terrain.blockReason,
    });
    if (!core.success) {
      for (const issue of core.error.issues) {
        context.addIssue({ code: "custom", path: issue.path, message: issue.message });
      }
    }
  });

/**
 * Loaded terrain record.
 */
export type TerrainContent = z.infer<typeof terrainContentSchema>;

const unlockTierSchema = z.enum(SettlementTier).optional();

const effectSchema = z.object({ modifierId: dottedIdSchema, value: signedMilliSchema }).strict();

const furnitureStorageSchema = z
  .object({
    slotCount: positiveSchema,
    weightLimit: milliSchema.nullable().default(null),
    categoryFilter: z.array(contentIdSchema).default([]),
  })
  .strict();

/**
 * Authored furniture prototype (spec 022 furniture record). `tags` are what recipes
 * (`workstationTag`) and zones refer to; `storage` is present when the piece holds items. The
 * build definition (spec 016, plan 3.5) is `constructionMaterials`, `constructionTicks` (base work
 * ticks at skill 0, default 24), `unlockTier`, `deconstructionYield` (what taking it down gives
 * back, default nothing) and `removable` (default true). Walls and doors (`wall`, `door`) are
 * records of the same table.
 */
export const furnitureSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    tags: z.array(contentIdSchema),
    constructionMaterials: z.array(materialAmountSchema),
    storage: furnitureStorageSchema.optional(),
    effects: z.array(effectSchema).default([]),
    unlockTier: unlockTierSchema,
    constructionTicks: positiveSchema.default(24),
    deconstructionYield: z.array(materialAmountSchema).default([]),
    removable: z.boolean().default(true),
  })
  .strict();

/**
 * Loaded furniture record.
 */
export type FurnitureContent = z.infer<typeof furnitureSchema>;

const furnitureAlternativeSchema = z
  .object({
    kind: z.enum(FurnitureRefKind),
    ref: contentIdSchema,
    count: positiveSchema,
    perTiles: positiveSchema.optional(),
  })
  .strict();

/**
 * Authored zone type (spec 022 zone record). Each entry of `furnitureRequirements` is a list of
 * alternatives (OR); the entries are combined with AND. An alternative with `perTiles` is a
 * density: it needs `count` pieces for every started `perTiles` tiles of the zone (at least
 * `count`). `requiresJobBoard` makes a job board inside the zone a requirement (spec 017 FR-018).
 * `cropOutputs` are the harvest yields of a crop zone (DECISIONS D-15); the other `crop*` fields
 * are the per-crop growth data (D-130): `cropTerrainId` the terrain a plot needs (default
 * `fertile_soil`), `cropGrowthTicks` the growth time (default the constant `cropGrowthTicks`),
 * `harvestJobId` the job that harvests ripe cells (default `farm.harvest`) and `perennial` zones
 * (orchard, vineyard, herb garden) replant themselves, so they have no sowing job.
 * `activityUnlocks` are the spec 022 `activity.unlock` effects (data only, DECISIONS D-80).
 */
export const zoneTypeSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    requiresRoom: z.boolean(),
    minTiles: countSchema,
    furnitureRequirements: z.array(z.array(furnitureAlternativeSchema).min(1)).default([]),
    requiresJobBoard: z.boolean().default(false),
    effects: z.array(effectSchema).default([]),
    skillAffinityId: contentIdSchema.optional(),
    cropOutputs: z.array(materialAmountSchema).default([]),
    cropTerrainId: contentIdSchema.optional(),
    cropGrowthTicks: positiveSchema.optional(),
    harvestJobId: dottedIdSchema.optional(),
    perennial: z.boolean().default(false),
    activityUnlocks: z.array(contentIdSchema).default([]),
    unlockTier: unlockTierSchema,
  })
  .strict();

/**
 * Loaded zone type record.
 */
export type ZoneTypeContent = z.infer<typeof zoneTypeSchema>;

/**
 * Authored production recipe (spec 022 recipe record, DECISIONS D-10). `workstationTag` is the
 * furniture tag of the station; `toolMaterialIds` are tools that are required but not consumed;
 * `minSkillLevel` (0 = anyone, task 3.3) is the least level of the recipe's skill a crafter needs.
 */
export const recipeSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    inputs: z.array(materialAmountSchema),
    outputs: z.array(materialAmountSchema).min(1),
    durationTicks: positiveSchema,
    workstationTag: contentIdSchema,
    skillId: contentIdSchema.nullable().default(null),
    toolMaterialIds: z.array(contentIdSchema).default([]),
    roomZoneId: contentIdSchema.optional(),
    minSkillLevel: z.number().int().min(0).max(100).default(0),
    unlockTier: unlockTierSchema,
  })
  .strict();

/**
 * Loaded recipe record.
 */
export type RecipeContent = z.infer<typeof recipeSchema>;

const zoneContextSchema = z
  .object({ kind: z.enum(ZoneContextKind), ref: contentIdSchema.optional() })
  .strict()
  .superRefine((context, ctx) => {
    const needsRef =
      context.kind === ZoneContextKind.Zone || context.kind === ZoneContextKind.Terrain;
    if (needsRef !== (context.ref !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["ref"],
        message: "ref is required for zone and terrain contexts and forbidden otherwise",
      });
    }
  });

/**
 * Authored job type (spec 022 job record). Gathering jobs list `outputs` (FR-024); `priority`
 * (default 50, DECISIONS D-54) is the posting priority when the poster names none, so essential
 * work (food) outranks background gathering; `onBoard: false` marks jobs that are never posted on a job board.
 * `charges` is how often a cell of a terrain job's deposit can be worked before it turns into the
 * terrain's `clearsTo` (default 1, DECISIONS D-130; ignored for terrain without `clearsTo`).
 */
export const jobTypeSchema = z
  .object({
    id: dottedIdSchema,
    name: z.string().min(1),
    skillId: contentIdSchema.nullable().default(null),
    toolMaterialId: contentIdSchema.nullable().default(null),
    zoneContext: zoneContextSchema,
    recurrence: z.enum(JobRecurrence),
    outputs: z.array(materialAmountSchema).default([]),
    charges: positiveSchema.default(1),
    wage: countSchema.default(0),
    priority: z.number().int().min(0).max(100).default(50),
    onBoard: z.boolean().default(true),
    unlockTier: unlockTierSchema,
  })
  .strict();

/**
 * Loaded job type record.
 */
export type JobTypeContent = z.infer<typeof jobTypeSchema>;
