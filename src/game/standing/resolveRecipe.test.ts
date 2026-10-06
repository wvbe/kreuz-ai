import { describe, expect, it } from "vitest";
import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import { getJobService } from "../jobs/jobServiceRegistry";
import { createAiWorld } from "../ai/testAiWorld";
import { resolveRecipe } from "./resolveRecipe";
import { StandingOrderError } from "./StandingOrderError";
import { StandingOrderErrorKind } from "./standingTypes";

function kindOf(action: () => void): StandingOrderErrorKind | null {
  try {
    action();
  } catch (failure) {
    return failure instanceof StandingOrderError ? failure.kind : null;
  }
  return null;
}

describe("resolveRecipe", () => {
  const world = createAiWorld();
  getJobService(world.engine).setTierSource(() => "chartered_town");

  it("takes the single recipe that makes a material", () => {
    expect(resolveRecipe(world.engine, "bread", undefined)).toEqual({
      materialId: "bread",
      recipeId: "bake_bread",
      outputPerRun: 2,
    });
  });

  it("takes the first output of a recipe given alone", () => {
    expect(resolveRecipe(world.engine, undefined, "saw_oak_planks")).toEqual({
      materialId: "oak_plank",
      recipeId: "saw_oak_planks",
      outputPerRun: 2,
    });
  });

  it("accepts both when the recipe outputs the material and refuses a mismatch", () => {
    expect(resolveRecipe(world.engine, "flour", "grind_flour").recipeId).toBe("grind_flour");
    expect(kindOf(() => resolveRecipe(world.engine, "bread", "grind_flour"))).toBe(
      StandingOrderErrorKind.NoProducingRecipe,
    );
  });

  it("reports a material nothing makes, an unknown id and a missing id", () => {
    expect(kindOf(() => resolveRecipe(world.engine, "wheat", undefined))).toBe(
      StandingOrderErrorKind.NoProducingRecipe,
    );
    expect(kindOf(() => resolveRecipe(world.engine, "unobtainium", undefined))).toBe(
      StandingOrderErrorKind.UnknownMaterial,
    );
    expect(kindOf(() => resolveRecipe(world.engine, undefined, "nope"))).toBe(
      StandingOrderErrorKind.UnknownRecipe,
    );
    expect(kindOf(() => resolveRecipe(world.engine, undefined, undefined))).toBe(
      StandingOrderErrorKind.InvalidQuantity,
    );
  });

  it("lists the candidates of an ambiguous material", () => {
    const recipes = bundledContentFiles[ContentFile.Recipes];
    const extra = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.Recipes]: [
        ...(Array.isArray(recipes) ? recipes : []),
        {
          id: "bake_bread_fine",
          name: "Fine bread",
          inputs: [{ materialId: "flour", quantity: 2 }],
          outputs: [{ materialId: "bread", quantity: 3 }],
          durationTicks: 30,
          workstationTag: "oven",
        },
      ],
    });
    const other = createAiWorld({ content: extra });
    try {
      resolveRecipe(other.engine, "bread", undefined);
      expect.unreachable("an ambiguous material must throw");
    } catch (failure) {
      expect(failure).toBeInstanceOf(StandingOrderError);
      expect((failure as StandingOrderError).candidates).toEqual(["bake_bread", "bake_bread_fine"]);
    }
  });

  it("refuses a recipe the settlement tier has not unlocked", () => {
    const recipes = bundledContentFiles[ContentFile.Recipes];
    const content = loadContentPack({
      ...bundledContentFiles,
      [ContentFile.Recipes]: [
        ...(Array.isArray(recipes) ? recipes : []),
        {
          id: "smelt_ingot",
          name: "Smelt ingot",
          inputs: [{ materialId: "iron_ore", quantity: 2 }],
          outputs: [{ materialId: "iron_ingot", quantity: 1 }],
          durationTicks: 30,
          workstationTag: "oven",
          unlockTier: "village",
        },
      ],
    });
    const locked = createAiWorld({ content });
    getJobService(locked.engine).setTierSource(() => "hamlet");
    expect(kindOf(() => resolveRecipe(locked.engine, "iron_ingot", "smelt_ingot"))).toBe(
      StandingOrderErrorKind.ContentLocked,
    );
    getJobService(locked.engine).setTierSource(() => "village");
    expect(resolveRecipe(locked.engine, "iron_ingot", "smelt_ingot").recipeId).toBe("smelt_ingot");
  });
});
