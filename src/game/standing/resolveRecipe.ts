import type { GameEngine } from "../engine/GameEngine";
import { isRecipeLocked } from "../production/productionQueries";
import { StandingOrderError } from "./StandingOrderError";
import { StandingOrderErrorKind } from "./standingTypes";

/**
 * What an order produces: the target material, the recipe and the units of the material one run
 * of the recipe makes.
 */
export type ResolvedRecipe = {
  materialId: string;
  recipeId: string;
  outputPerRun: number;
};

/**
 * Resolves the recipe and material of a new standing order (spec 026 FR-002). With a material
 * only, the single recipe whose outputs contain it is taken (`NoProducingRecipe` for none,
 * `AmbiguousRecipe` with the candidates for several); with a recipe only, the target is its first
 * output; with both, the recipe must output the material. `outputPerRun` is the recipe's quantity
 * of the target material. A recipe the settlement tier has not unlocked is `ContentLocked`
 * (FR-004).
 *
 * @param engine - The engine.
 * @param materialId - The material to keep in stock, or undefined.
 * @param recipeId - The recipe to use, or undefined.
 * @returns The resolved recipe.
 * @throws StandingOrderError `UnknownMaterial`, `UnknownRecipe`, `NoProducingRecipe`,
 *   `AmbiguousRecipe`, `ContentLocked`, `InvalidQuantity` when neither id is given.
 */
export function resolveRecipe(
  engine: GameEngine,
  materialId: string | undefined,
  recipeId: string | undefined,
): ResolvedRecipe {
  if (materialId === undefined && recipeId === undefined) {
    throw new StandingOrderError(
      StandingOrderErrorKind.InvalidQuantity,
      "an order needs a materialId or a recipeId",
    );
  }
  if (materialId !== undefined && !engine.materials.has(materialId)) {
    throw new StandingOrderError(
      StandingOrderErrorKind.UnknownMaterial,
      `material "${materialId}" is not in the content pack`,
    );
  }
  let chosenId = recipeId;
  if (chosenId === undefined && materialId !== undefined) {
    const candidates = engine.content.recipes
      .all()
      .filter((recipe) => recipe.outputs.some((output) => output.materialId === materialId))
      .map((recipe) => recipe.id);
    if (candidates.length === 0) {
      throw new StandingOrderError(
        StandingOrderErrorKind.NoProducingRecipe,
        `no recipe makes "${materialId}"`,
      );
    }
    if (candidates.length > 1) {
      throw new StandingOrderError(
        StandingOrderErrorKind.AmbiguousRecipe,
        `several recipes make "${materialId}": ${candidates.join(", ")}`,
        candidates,
      );
    }
    chosenId = candidates[0];
  }
  const recipe = chosenId === undefined ? undefined : engine.content.recipes.find(chosenId);
  if (recipe === undefined) {
    throw new StandingOrderError(
      StandingOrderErrorKind.UnknownRecipe,
      `recipe "${chosenId ?? ""}" is not in the content pack`,
    );
  }
  const target = materialId ?? recipe.outputs[0]?.materialId;
  const output = recipe.outputs.find((entry) => entry.materialId === target);
  if (target === undefined || output === undefined) {
    throw new StandingOrderError(
      StandingOrderErrorKind.NoProducingRecipe,
      `recipe "${recipe.id}" does not make "${materialId ?? ""}"`,
    );
  }
  if (isRecipeLocked(engine, recipe)) {
    throw new StandingOrderError(
      StandingOrderErrorKind.ContentLocked,
      `recipe "${recipe.id}" needs tier ${recipe.unlockTier ?? ""}`,
    );
  }
  return { materialId: target, recipeId: recipe.id, outputPerRun: output.quantity };
}
