import { Registry } from './Registry.js';
import {
  createMaterialRegistry,
  createSkillRegistry,
  createNeedRegistry,
  createTerrainTypeRegistry,
  createTraitRegistry,
  createFurnitureRegistry,
  createZoneTypeRegistry,
  createFactionRegistry,
  createJobTypeRegistry,
  createRecipeRegistry,
  createBehaviorTreeRegistry,
  createEntityPrototypeRegistry,
} from '../registries/index.js';

export interface ContentValidationError {
  registry: string;
  entryId?: string;
  field?: string;
  message: string;
  referencedId?: string;
  referencedRegistry?: string;
}

export interface ContentValidationWarning {
  registry: string;
  entryId?: string;
  message: string;
}

export interface ContentLoadResult {
  success: boolean;
  errors: ContentValidationError[];
  warnings: ContentValidationWarning[];
  registries?: ContentRegistries;
}

export interface ContentRegistries {
  materials: Registry<any>;
  skills: Registry<any>;
  needs: Registry<any>;
  terrainTypes: Registry<any>;
  traits: Registry<any>;
  furniture: Registry<any>;
  zoneTypes: Registry<any>;
  factions: Registry<any>;
  jobTypes: Registry<any>;
  recipes: Registry<any>;
  behaviorTrees: Registry<any>;
  entityPrototypes: Registry<any>;
}

/**
 * Top-level orchestrator that loads all registries and validates cross-references.
 */
export class ContentLoader {
  loadAllContent(): ContentLoadResult {
    const errors: ContentValidationError[] = [];
    const warnings: ContentValidationWarning[] = [];

    // Load in dependency order: leaf → mid-tier → top-tier
    const materials = createMaterialRegistry();
    const skills = createSkillRegistry();
    const needs = createNeedRegistry();
    const terrainTypes = createTerrainTypeRegistry();
    const traits = createTraitRegistry();
    const furniture = createFurnitureRegistry();
    const zoneTypes = createZoneTypeRegistry();
    const factions = createFactionRegistry();
    const jobTypes = createJobTypeRegistry();
    const recipes = createRecipeRegistry();
    const behaviorTrees = createBehaviorTreeRegistry();
    const entityPrototypes = createEntityPrototypeRegistry();

    const registries: ContentRegistries = {
      materials, skills, needs, terrainTypes, traits,
      furniture, zoneTypes, factions, jobTypes,
      recipes, behaviorTrees, entityPrototypes,
    };

    // Cross-registry validation: recipe references
    for (const recipe of recipes.getAll() as readonly any[]) {
      for (const input of recipe.inputs) {
        if (!materials.has(input.materialId)) {
          errors.push({ registry: 'recipes', entryId: recipe.id, field: 'inputs', message: `Unknown input material "${input.materialId}"`, referencedId: input.materialId, referencedRegistry: 'materials' });
        }
      }
      for (const output of recipe.outputs) {
        if (!materials.has(output.materialId)) {
          errors.push({ registry: 'recipes', entryId: recipe.id, field: 'outputs', message: `Unknown output material "${output.materialId}"`, referencedId: output.materialId, referencedRegistry: 'materials' });
        }
      }
      if (recipe.restrictions?.skill && !skills.has(recipe.restrictions.skill.skillId)) {
        errors.push({ registry: 'recipes', entryId: recipe.id, field: 'restrictions.skill', message: `Unknown skill "${recipe.restrictions.skill.skillId}"`, referencedId: recipe.restrictions.skill.skillId, referencedRegistry: 'skills' });
      }
      if (recipe.restrictions?.workstation && !furniture.has(recipe.restrictions.workstation)) {
        errors.push({ registry: 'recipes', entryId: recipe.id, field: 'restrictions.workstation', message: `Unknown workstation "${recipe.restrictions.workstation}"`, referencedId: recipe.restrictions.workstation, referencedRegistry: 'furniture' });
      }
    }

    // Cross-registry validation: furniture construction materials
    for (const item of furniture.getAll() as readonly any[]) {
      if (item.constructionMaterials) {
        for (const mat of item.constructionMaterials) {
          if (!materials.has(mat.materialId)) {
            errors.push({ registry: 'furniture', entryId: item.id, field: 'constructionMaterials', message: `Unknown material "${mat.materialId}"`, referencedId: mat.materialId, referencedRegistry: 'materials' });
          }
        }
      }
    }

    // Cross-registry validation: zone furniture references
    for (const zone of zoneTypes.getAll() as readonly any[]) {
      if (zone.requiredFurniture) {
        for (const fId of zone.requiredFurniture) {
          if (!furniture.has(fId)) {
            errors.push({ registry: 'zoneTypes', entryId: zone.id, field: 'requiredFurniture', message: `Unknown furniture "${fId}"`, referencedId: fId, referencedRegistry: 'furniture' });
          }
        }
      }
      if (zone.optionalFurniture) {
        for (const fId of zone.optionalFurniture) {
          if (!furniture.has(fId)) {
            errors.push({ registry: 'zoneTypes', entryId: zone.id, field: 'optionalFurniture', message: `Unknown furniture "${fId}"`, referencedId: fId, referencedRegistry: 'furniture' });
          }
        }
      }
    }

    // Cross-registry validation: entity prototype references
    for (const entity of entityPrototypes.getAll() as readonly any[]) {
      if (entity.startingSkills) {
        for (const s of entity.startingSkills) {
          if (!skills.has(s.skillId)) {
            errors.push({ registry: 'entityPrototypes', entryId: entity.id, field: 'startingSkills', message: `Unknown skill "${s.skillId}"`, referencedId: s.skillId, referencedRegistry: 'skills' });
          }
        }
      }
      if (entity.defaultTraits) {
        for (const tId of entity.defaultTraits) {
          if (!traits.has(tId)) {
            errors.push({ registry: 'entityPrototypes', entryId: entity.id, field: 'defaultTraits', message: `Unknown trait "${tId}"`, referencedId: tId, referencedRegistry: 'traits' });
          }
        }
      }
      if (entity.defaultFactions) {
        for (const fId of entity.defaultFactions) {
          if (!factions.has(fId)) {
            errors.push({ registry: 'entityPrototypes', entryId: entity.id, field: 'defaultFactions', message: `Unknown faction "${fId}"`, referencedId: fId, referencedRegistry: 'factions' });
          }
        }
      }
      if (entity.behaviorTree && !behaviorTrees.has(entity.behaviorTree)) {
        errors.push({ registry: 'entityPrototypes', entryId: entity.id, field: 'behaviorTree', message: `Unknown behavior tree "${entity.behaviorTree}"`, referencedId: entity.behaviorTree, referencedRegistry: 'behaviorTrees' });
      }
    }

    // Cross-registry validation: job type skill references
    for (const job of jobTypes.getAll() as readonly any[]) {
      if (job.requiredSkill && !skills.has(job.requiredSkill)) {
        errors.push({ registry: 'jobTypes', entryId: job.id, field: 'requiredSkill', message: `Unknown skill "${job.requiredSkill}"`, referencedId: job.requiredSkill, referencedRegistry: 'skills' });
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
      registries,
    };
  }
}
