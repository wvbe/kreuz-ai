import type { z } from "zod";
import type { BehaviorTreeDefinition } from "../behavior/behaviorTypes";
import { behaviorTreeSchema } from "../behavior/behaviorTreeSchema";
import { isJsonObject } from "../ecs/jsonData";
import { prototypeSchema } from "../ecs/PrototypeRegistry";
import type { PrototypeDefinition } from "../ecs/PrototypeRegistry";
import type { JsonValue } from "../engine/EventBus";
import type { MaterialDefinition } from "../inventory/MaterialRegistry";
import { ContentFile } from "./contentTypes";
import type { ContentIssue, ContentPackFiles } from "./contentTypes";
import {
  animalPrototypeSchema,
  factionSchema,
  humanoidPrototypeSchema,
  nameListSchema,
  needSchema,
  skillSchema,
  traitSchema,
} from "./schemas/characterSchemas";
import type {
  AnimalPrototypeContent,
  FactionContent,
  HumanoidPrototypeContent,
  NameListContent,
  NeedContent,
  SkillContent,
  TraitContent,
} from "./schemas/characterSchemas";
import {
  categorySchema,
  furnitureSchema,
  jobTypeSchema,
  materialContentSchema,
  recipeSchema,
  terrainContentSchema,
  zoneTypeSchema,
} from "./schemas/economySchemas";
import type {
  CategoryContent,
  FurnitureContent,
  JobTypeContent,
  RecipeContent,
  TerrainContent,
  ZoneTypeContent,
} from "./schemas/economySchemas";
import {
  contentConstantsSchema,
  difficultyModeSchema,
  dwellingLevelSchema,
  momentTemplateSchema,
  nameFormatsSchema,
  settlementTierSchema,
} from "./schemas/tableSchemas";
import type {
  ContentConstants,
  DifficultyModeContent,
  DwellingLevelContent,
  MomentTemplateContent,
  NameFormatsContent,
  SettlementTierContent,
} from "./schemas/tableSchemas";

/**
 * Every category of a pack after per-file schema validation and decimal conversion. Lists keep
 * file order. Cross-file integrity is checked separately by `checkReferences`.
 */
export type ParsedContent = {
  categories: CategoryContent[];
  terrain: TerrainContent[];
  materials: MaterialDefinition[];
  needs: NeedContent[];
  skills: SkillContent[];
  traits: TraitContent[];
  furniture: FurnitureContent[];
  zones: ZoneTypeContent[];
  recipes: RecipeContent[];
  jobs: JobTypeContent[];
  factions: FactionContent[];
  behaviorTrees: BehaviorTreeDefinition[];
  nameLists: NameListContent[];
  humanoids: HumanoidPrototypeContent[];
  animals: AnimalPrototypeContent[];
  enginePrototypes: PrototypeDefinition[];
  dwellingLevels: DwellingLevelContent[];
  settlementTiers: SettlementTierContent[];
  difficultyModes: DifficultyModeContent[];
  momentTemplates: MomentTemplateContent[];
  nameFormats: NameFormatsContent;
  constants: ContentConstants;
};

/**
 * Outcome of parsing: the content is only present when no issue was found.
 */
export type ParseResult = {
  content: ParsedContent | null;
  issues: ContentIssue[];
};

function rawIdOf(raw: JsonValue | undefined, idField: string, index: number): string {
  if (isJsonObject(raw)) {
    const value = raw[idField];
    if (typeof value === "string") {
      return value;
    }
  }
  return `#${index}`;
}

function describePath(path: readonly PropertyKey[]): string {
  return path.map((part) => String(part)).join(".");
}

function parseList<Item>(
  files: ContentPackFiles,
  file: ContentFile,
  schema: z.ZodType<Item>,
  issues: ContentIssue[],
  idField = "id",
  keyOf: (item: Item) => string = (item) => String((item as { id: string }).id),
): Item[] {
  const raw = files[file];
  if (raw === undefined) {
    issues.push({ file, id: null, field: "", message: "file is missing from the pack" });
    return [];
  }
  if (!Array.isArray(raw)) {
    issues.push({ file, id: null, field: "", message: "expected a JSON array of records" });
    return [];
  }
  const result: Item[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const parsed = schema.safeParse(entry);
    if (!parsed.success) {
      const id = rawIdOf(entry, idField, index);
      for (const issue of parsed.error.issues) {
        issues.push({ file, id, field: describePath(issue.path), message: issue.message });
      }
      return;
    }
    const key = keyOf(parsed.data);
    if (seen.has(key)) {
      issues.push({ file, id: key, field: idField, message: `duplicate ${idField} "${key}"` });
      return;
    }
    seen.add(key);
    result.push(parsed.data);
  });
  return result;
}

function parseSingle<Item>(
  files: ContentPackFiles,
  file: ContentFile,
  schema: z.ZodType<Item>,
  issues: ContentIssue[],
): Item | null {
  const raw = files[file];
  if (raw === undefined) {
    issues.push({ file, id: null, field: "", message: "file is missing from the pack" });
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ file, id: null, field: describePath(issue.path), message: issue.message });
    }
    return null;
  }
  return parsed.data;
}

/**
 * Validates every file of a pack against its Zod schema, in the fixed {@link ContentFile} order,
 * converting authored decimals to fixed point. Collects all problems (missing or malformed
 * files, bad records, duplicate ids) instead of stopping at the first.
 *
 * @param files - Parsed JSON of the pack.
 * @returns The typed content when there is no issue, plus the issues found.
 */
export function parseContentPack(files: ContentPackFiles): ParseResult {
  const issues: ContentIssue[] = [];
  const categories = parseList(files, ContentFile.Categories, categorySchema, issues);
  const terrain = parseList(files, ContentFile.Terrain, terrainContentSchema, issues);
  const materials = parseList(files, ContentFile.Materials, materialContentSchema, issues);
  const needs = parseList(files, ContentFile.Needs, needSchema, issues);
  const skills = parseList(files, ContentFile.Skills, skillSchema, issues);
  const traits = parseList(files, ContentFile.Traits, traitSchema, issues);
  const furniture = parseList(files, ContentFile.Furniture, furnitureSchema, issues);
  const zones = parseList(files, ContentFile.Zones, zoneTypeSchema, issues);
  const recipes = parseList(files, ContentFile.Recipes, recipeSchema, issues);
  const jobs = parseList(files, ContentFile.Jobs, jobTypeSchema, issues);
  const factions = parseList(files, ContentFile.Factions, factionSchema, issues);
  const behaviorTrees = parseList(files, ContentFile.BehaviorTrees, behaviorTreeSchema, issues);
  const nameLists = parseList(files, ContentFile.NameLists, nameListSchema, issues);
  const humanoids = parseList(
    files,
    ContentFile.HumanoidPrototypes,
    humanoidPrototypeSchema,
    issues,
  );
  const animals = parseList(files, ContentFile.AnimalPrototypes, animalPrototypeSchema, issues);
  const enginePrototypes = parseList(files, ContentFile.EnginePrototypes, prototypeSchema, issues);
  const dwellingLevels = parseList(
    files,
    ContentFile.DwellingLevels,
    dwellingLevelSchema,
    issues,
    "level",
    (item) => item.level,
  );
  const settlementTiers = parseList(
    files,
    ContentFile.SettlementTiers,
    settlementTierSchema,
    issues,
    "tier",
    (item) => item.tier,
  );
  const difficultyModes = parseList(
    files,
    ContentFile.DifficultyModes,
    difficultyModeSchema,
    issues,
    "difficulty",
    (item) => item.difficulty,
  );
  const momentTemplates = parseList(
    files,
    ContentFile.MomentTemplates,
    momentTemplateSchema,
    issues,
    "kind",
    (item) => item.kind,
  );
  const nameFormats = parseSingle(files, ContentFile.NameFormats, nameFormatsSchema, issues);
  const constants = parseSingle(
    files,
    ContentFile.ContentConstants,
    contentConstantsSchema,
    issues,
  );
  if (issues.length > 0 || nameFormats === null || constants === null) {
    return { content: null, issues };
  }
  return {
    content: {
      categories,
      terrain,
      materials,
      needs,
      skills,
      traits,
      furniture,
      zones,
      recipes,
      jobs,
      factions,
      behaviorTrees,
      nameLists,
      humanoids,
      animals,
      enginePrototypes,
      dwellingLevels,
      settlementTiers,
      difficultyModes,
      momentTemplates,
      nameFormats,
      constants,
    },
    issues,
  };
}
