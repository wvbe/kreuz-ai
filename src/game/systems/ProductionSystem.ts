/**
 * Production system: recipe execution, input consumption, output production.
 */

import type { EntityManager, EntityId } from "../engine/EntityManager";
import { addItem, removeItem, hasEnough } from "./InventorySystem";
import { getSkillLevel } from "./SkillSystem";
import type { SkillsComponent } from "./SkillSystem";
import { getComponent } from "../engine/EntityManager";

export type RecipeInput = {
  materialId: string;
  quantity: number;
};

export type RecipeOutput = {
  materialId: string;
  quantity: number;
};

export type Recipe = {
  recipeId: string;
  name: string;
  inputs: RecipeInput[];
  outputs: RecipeOutput[];
  requiredSkill?: string;
  requiredSkillLevel?: number;
  workRequired: number;
  stationType: string;
};

/**
 * Checks if an entity can execute a recipe (has inputs and skill).
 */
export function canExecuteRecipe(
  manager: EntityManager,
  entityId: EntityId,
  recipe: Recipe,
): boolean {
  // Check skill
  if (recipe.requiredSkill) {
    const skills = getComponent(manager, entityId, "skills") as SkillsComponent | undefined;
    if (!skills) return false;
    if (getSkillLevel(skills, recipe.requiredSkill) < (recipe.requiredSkillLevel ?? 0)) {
      return false;
    }
  }

  // Check inputs
  for (const input of recipe.inputs) {
    if (!hasEnough(manager, entityId, input.materialId, input.quantity)) {
      return false;
    }
  }
  return true;
}

/**
 * Executes a recipe: consumes inputs and produces outputs.
 */
export function executeRecipe(
  manager: EntityManager,
  entityId: EntityId,
  recipe: Recipe,
): boolean {
  if (!canExecuteRecipe(manager, entityId, recipe)) return false;

  // Consume inputs
  for (const input of recipe.inputs) {
    removeItem(manager, entityId, input.materialId, input.quantity);
  }

  // Produce outputs
  for (const output of recipe.outputs) {
    addItem(manager, entityId, output.materialId, output.quantity);
  }

  return true;
}
