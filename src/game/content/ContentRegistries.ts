import type { BehaviorHandlerRegistry } from "../behavior/BehaviorHandlerRegistry";
import { BehaviorTreeRegistry } from "../behavior/BehaviorTreeRegistry";
import type { BehaviorTreeDefinition } from "../behavior/behaviorTypes";
import type { ComponentRegistry } from "../ecs/ComponentRegistry";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import type { PrototypeDefinition } from "../ecs/PrototypeRegistry";
import { MaterialRegistry } from "../inventory/MaterialRegistry";
import { TerrainRegistry } from "../map/TerrainRegistry";
import { ContentTable } from "./ContentTable";
import { humanoidPrototypeDefinition } from "./humanoidPrototypeDefinition";
import type { ParsedContent } from "./parseContentPack";
import type {
  AnimalPrototypeContent,
  FactionContent,
  HumanoidPrototypeContent,
  NameListContent,
  NeedContent,
  SkillContent,
  TraitContent,
} from "./schemas/characterSchemas";
import type {
  CategoryContent,
  FurnitureContent,
  JobTypeContent,
  RecipeContent,
  TerrainContent,
  ZoneTypeContent,
} from "./schemas/economySchemas";
import type {
  ContentConstants,
  DifficultyModeContent,
  DwellingLevelContent,
  MomentTemplateContent,
  NameFormatsContent,
  SettlementTierContent,
} from "./schemas/tableSchemas";

function byId<Item extends { id: string }>(
  name: string,
  records: readonly Item[],
): ContentTable<Item> {
  return new ContentTable(name, records, (record) => record.id);
}

/**
 * Id of the player government faction prototype that engine bootstrap instantiates (spec 007
 * FR-002, DECISIONS D-06).
 */
export const governmentFactionPrototypeId = "government_faction";

/**
 * The loaded content of one engine (DECISIONS AD8): read-only typed lookups for every category.
 * Instances share nothing; a new `ContentRegistries` is built per engine by the loader.
 * `materials` and `terrain` are the inventory and map modules' own registries, already filled;
 * the other categories are frozen {@link ContentTable}s. Use {@link createPrototypeRegistry} and
 * {@link createBehaviorTreeRegistry} to plug content into the ECS and the behavior runtime.
 */
export class ContentRegistries {
  readonly materials = new MaterialRegistry();
  readonly terrain = new TerrainRegistry();
  readonly terrainContent: ContentTable<TerrainContent>;
  readonly categories: ContentTable<CategoryContent>;
  readonly needs: ContentTable<NeedContent>;
  readonly skills: ContentTable<SkillContent>;
  readonly traits: ContentTable<TraitContent>;
  readonly furniture: ContentTable<FurnitureContent>;
  readonly zones: ContentTable<ZoneTypeContent>;
  readonly recipes: ContentTable<RecipeContent>;
  readonly jobs: ContentTable<JobTypeContent>;
  readonly factions: ContentTable<FactionContent>;
  readonly behaviorTrees: ContentTable<BehaviorTreeDefinition>;
  readonly nameLists: ContentTable<NameListContent>;
  readonly humanoids: ContentTable<HumanoidPrototypeContent>;
  readonly animals: ContentTable<AnimalPrototypeContent>;
  readonly enginePrototypes: ContentTable<PrototypeDefinition>;
  readonly dwellingLevels: ContentTable<DwellingLevelContent>;
  readonly settlementTiers: ContentTable<SettlementTierContent>;
  readonly difficultyModes: ContentTable<DifficultyModeContent>;
  readonly momentTemplates: ContentTable<MomentTemplateContent>;
  readonly nameFormats: NameFormatsContent;
  readonly constants: ContentConstants;

  /**
   * Builds the registries from validated content. Use `loadContentPack`, which validates first.
   *
   * @param content - Schema-valid, reference-checked content.
   */
  constructor(content: ParsedContent) {
    this.materials.registerAll(content.materials);
    this.terrain.registerAll(
      content.terrain.map((entry) => ({
        id: entry.id,
        moveCost: entry.moveCost,
        passable: entry.passable,
        blockReason: entry.blockReason,
      })),
    );
    this.terrainContent = byId("terrain", content.terrain);
    this.categories = byId("categories", content.categories);
    this.needs = byId("needs", content.needs);
    this.skills = byId("skills", content.skills);
    this.traits = byId("traits", content.traits);
    this.furniture = byId("furniture", content.furniture);
    this.zones = byId("zones", content.zones);
    this.recipes = byId("recipes", content.recipes);
    this.jobs = byId("jobs", content.jobs);
    this.factions = byId("factions", content.factions);
    this.behaviorTrees = byId("behavior trees", content.behaviorTrees);
    this.nameLists = byId("name lists", content.nameLists);
    this.humanoids = byId("humanoid prototypes", content.humanoids);
    this.animals = byId("animal prototypes", content.animals);
    this.enginePrototypes = byId("engine prototypes", content.enginePrototypes);
    this.dwellingLevels = new ContentTable(
      "dwelling levels",
      content.dwellingLevels,
      (entry) => entry.level,
    );
    this.settlementTiers = new ContentTable(
      "settlement tiers",
      content.settlementTiers,
      (entry) => entry.tier,
    );
    this.difficultyModes = new ContentTable(
      "difficulty modes",
      content.difficultyModes,
      (entry) => entry.difficulty,
    );
    this.momentTemplates = new ContentTable(
      "moment templates",
      content.momentTemplates,
      (entry) => entry.kind,
    );
    this.nameFormats = Object.freeze({ ...content.nameFormats });
    this.constants = Object.freeze({ ...content.constants });
  }

  /**
   * Creates a fresh `PrototypeRegistry` holding every engine prototype and every humanoid
   * prototype (see {@link humanoidPrototypeDefinition}). The component registry must already
   * contain the components the prototypes use (`Position`, `Inventory`, `TaskQueue`, `AiState`).
   *
   * @param components - The engine's component registry.
   * @returns A new registry, independent of any other.
   */
  createPrototypeRegistry(components: ComponentRegistry): PrototypeRegistry {
    const prototypes = new PrototypeRegistry(components);
    this.registerPrototypes(prototypes);
    return prototypes;
  }

  /**
   * Registers every engine prototype and every humanoid prototype into an existing registry (the
   * engine fills its own registry lazily, once all systems have registered their components).
   *
   * @param prototypes - Registry to fill; it must not contain any of these ids yet.
   */
  registerPrototypes(prototypes: PrototypeRegistry): void {
    for (const prototype of this.enginePrototypes.all()) {
      prototypes.register(structuredClone(prototype));
    }
    for (const humanoid of this.humanoids.all()) {
      prototypes.register(humanoidPrototypeDefinition(humanoid, this.materials));
    }
  }

  /**
   * Creates a fresh `BehaviorTreeRegistry` with every tree of the pack. Handler ids are checked
   * against `handlers` and `run_tree` references and cycles by the registry itself.
   *
   * @param handlers - The engine's registered conditions and actions.
   * @returns A new registry, independent of any other.
   */
  createBehaviorTreeRegistry(handlers: BehaviorHandlerRegistry): BehaviorTreeRegistry {
    const trees = new BehaviorTreeRegistry(handlers);
    trees.registerAll(this.behaviorTrees.all().map((tree) => structuredClone(tree)));
    return trees;
  }
}
