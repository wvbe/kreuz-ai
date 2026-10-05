import { BehaviorError } from "../behavior/BehaviorError";
import type { BehaviorHandlerRegistry } from "../behavior/BehaviorHandlerRegistry";
import { checkReferences } from "./checkReferences";
import { ContentRegistries } from "./ContentRegistries";
import { ContentValidationError } from "./ContentValidationError";
import { ContentFile } from "./contentTypes";
import type { ContentIssue, ContentPackFiles } from "./contentTypes";
import type { JsonValue } from "../engine/EventBus";
import { parseContentPack } from "./parseContentPack";
// JSON-import carve-out (DECISIONS AD11/D-22): content is bundled with static imports in a fixed
// order; there is no filesystem scanning at runtime.
import categoriesJson from "./data/categories.json";
import terrainJson from "./data/terrain.json";
import materialsJson from "./data/materials.json";
import needsJson from "./data/needs.json";
import skillsJson from "./data/skills.json";
import traitsJson from "./data/traits.json";
import furnitureJson from "./data/furniture.json";
import zonesJson from "./data/zones.json";
import recipesJson from "./data/recipes.json";
import jobsJson from "./data/jobs.json";
import factionsJson from "./data/factions.json";
import behaviorTreesJson from "./data/behavior-trees.json";
import nameListsJson from "./data/name-lists.json";
import humanoidPrototypesJson from "./data/humanoid-prototypes.json";
import animalPrototypesJson from "./data/animal-prototypes.json";
import enginePrototypesJson from "./data/engine-prototypes.json";
import dwellingLevelsJson from "./data/dwelling-levels.json";
import settlementTiersJson from "./data/settlement-tiers.json";
import difficultyModesJson from "./data/difficulty-modes.json";
import contentConstantsJson from "./data/content-constants.json";
import momentTemplatesJson from "./data/moment-templates.json";
import nameFormatsJson from "./data/name-formats.json";

/**
 * Shape of anything that produces the registries of one engine; engine bootstrap can take one
 * of these so tests inject {@link loadContent} or a loader over an alternative pack.
 */
export type ContentLoader = (options?: LoadContentOptions) => ContentRegistries;

/**
 * Options of {@link loadContentPack} and {@link loadContent}.
 */
export type LoadContentOptions = {
  /**
   * When given, every behavior tree is also checked against these handlers (unknown condition or
   * action ids are load errors, spec 022 FR-014). Without it handler names are not checked and
   * the engine checks them later through `createBehaviorTreeRegistry`.
   */
  handlers?: BehaviorHandlerRegistry;
};

// Boundary cast (DECISIONS D-22): TypeScript infers JSON imports with optional-undefined union
// members that are not assignable to JsonValue; the content is validated by Zod at load.
function asJson(value: object): JsonValue {
  // eslint-disable-next-line no-restricted-syntax -- JSON import boundary, validated by Zod in loadContentPack
  return value as unknown as JsonValue;
}

/**
 * The content pack that ships with the game, as parsed JSON in the fixed load order of
 * {@link ContentFile}. Today this is vertical-slice pack v0 (see `data/README.md`).
 */
export const bundledContentFiles: ContentPackFiles = {
  [ContentFile.Categories]: asJson(categoriesJson),
  [ContentFile.Terrain]: asJson(terrainJson),
  [ContentFile.Materials]: asJson(materialsJson),
  [ContentFile.Needs]: asJson(needsJson),
  [ContentFile.Skills]: asJson(skillsJson),
  [ContentFile.Traits]: asJson(traitsJson),
  [ContentFile.Furniture]: asJson(furnitureJson),
  [ContentFile.Zones]: asJson(zonesJson),
  [ContentFile.Recipes]: asJson(recipesJson),
  [ContentFile.Jobs]: asJson(jobsJson),
  [ContentFile.Factions]: asJson(factionsJson),
  [ContentFile.BehaviorTrees]: asJson(behaviorTreesJson),
  [ContentFile.NameLists]: asJson(nameListsJson),
  [ContentFile.HumanoidPrototypes]: asJson(humanoidPrototypesJson),
  [ContentFile.AnimalPrototypes]: asJson(animalPrototypesJson),
  [ContentFile.EnginePrototypes]: asJson(enginePrototypesJson),
  [ContentFile.DwellingLevels]: asJson(dwellingLevelsJson),
  [ContentFile.SettlementTiers]: asJson(settlementTiersJson),
  [ContentFile.DifficultyModes]: asJson(difficultyModesJson),
  [ContentFile.ContentConstants]: asJson(contentConstantsJson),
  [ContentFile.MomentTemplates]: asJson(momentTemplatesJson),
  [ContentFile.NameFormats]: asJson(nameFormatsJson),
};

function checkHandlers(
  registries: ContentRegistries,
  handlers: BehaviorHandlerRegistry,
): ContentIssue[] {
  try {
    registries.createBehaviorTreeRegistry(handlers);
    return [];
  } catch (error) {
    if (!(error instanceof BehaviorError)) {
      throw error;
    }
    const named = /tree "([a-z0-9_]+)"/.exec(error.message);
    return [
      {
        file: ContentFile.BehaviorTrees,
        id: named?.[1] ?? null,
        field: "root",
        message: error.message,
      },
    ];
  }
}

/**
 * Loads a content pack from already parsed JSON, so tests and tools can load alternative or
 * invalid packs without the filesystem. Validates every file with Zod (converting decimals to
 * fixed point), then checks references, and returns a brand new {@link ContentRegistries} that
 * shares nothing with any other load (DECISIONS AD8).
 *
 * @param files - Parsed JSON of the pack by file.
 * @param options - Optional handler registry for behavior tree checks.
 * @returns The registries of this engine.
 * @throws ContentValidationError listing every problem found, each naming file, id and field.
 *   References are only checked once all files are schema-valid, to avoid cascades of errors.
 */
export function loadContentPack(
  files: ContentPackFiles,
  options: LoadContentOptions = {},
): ContentRegistries {
  const parsed = parseContentPack(files);
  if (parsed.content === null) {
    throw new ContentValidationError(parsed.issues);
  }
  const issues = checkReferences(parsed.content);
  if (issues.length > 0) {
    throw new ContentValidationError(issues);
  }
  const registries = new ContentRegistries(parsed.content);
  if (options.handlers !== undefined) {
    const handlerIssues = checkHandlers(registries, options.handlers);
    if (handlerIssues.length > 0) {
      throw new ContentValidationError(handlerIssues);
    }
  }
  return registries;
}

/**
 * Loads the bundled content pack into fresh registries.
 *
 * @param options - Optional handler registry for behavior tree checks.
 * @returns The registries of this engine.
 */
export function loadContent(options: LoadContentOptions = {}): ContentRegistries {
  return loadContentPack(bundledContentFiles, options);
}
