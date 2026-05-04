import { describe, it, expect } from "vitest";
import { ContentLoader } from "../../src/engine/ContentLoader.js";

describe("Cross-Registry Validation", () => {
  const loader = new ContentLoader();
  const result = loader.loadAllContent();

  it("loadAllContent returns success with no errors", () => {
    if (result.errors.length > 0) {
      const messages = result.errors.map(
        (e) => `[${e.registry}/${e.entryId}] ${e.message}`,
      );
      throw new Error(
        `Cross-registry validation errors:\n${messages.join("\n")}`,
      );
    }
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("all 12 registries are loaded", () => {
    const r = result.registries!;
    expect(r.materials.size).toBeGreaterThan(0);
    expect(r.skills.size).toBeGreaterThan(0);
    expect(r.needs.size).toBeGreaterThan(0);
    expect(r.terrainTypes.size).toBeGreaterThan(0);
    expect(r.traits.size).toBeGreaterThan(0);
    expect(r.furniture.size).toBeGreaterThan(0);
    expect(r.zoneTypes.size).toBeGreaterThan(0);
    expect(r.factions.size).toBeGreaterThan(0);
    expect(r.jobTypes.size).toBeGreaterThan(0);
    expect(r.recipes.size).toBeGreaterThan(0);
    expect(r.behaviorTrees.size).toBeGreaterThan(0);
    expect(r.entityPrototypes.size).toBeGreaterThan(0);
  });

  it("all recipe material references exist in materials registry", () => {
    const r = result.registries!;
    for (const recipe of r.recipes.getAll() as readonly any[]) {
      for (const input of recipe.inputs) {
        expect(
          r.materials.has(input.materialId),
          `Recipe "${recipe.id}" input "${input.materialId}" not in materials`,
        ).toBe(true);
      }
      for (const output of recipe.outputs) {
        expect(
          r.materials.has(output.materialId),
          `Recipe "${recipe.id}" output "${output.materialId}" not in materials`,
        ).toBe(true);
      }
    }
  });

  it("all furniture construction material references exist", () => {
    const r = result.registries!;
    for (const item of r.furniture.getAll() as readonly any[]) {
      if (item.constructionMaterials) {
        for (const mat of item.constructionMaterials) {
          expect(
            r.materials.has(mat.materialId),
            `Furniture "${item.id}" material "${mat.materialId}" not in materials`,
          ).toBe(true);
        }
      }
    }
  });

  it("all zone furniture references exist", () => {
    const r = result.registries!;
    for (const zone of r.zoneTypes.getAll() as readonly any[]) {
      for (const fId of [
        ...(zone.requiredFurniture ?? []),
        ...(zone.optionalFurniture ?? []),
      ]) {
        expect(
          r.furniture.has(fId),
          `Zone "${zone.id}" furniture "${fId}" not in furniture`,
        ).toBe(true);
      }
    }
  });

  it("all entity prototype skill/trait/faction/behaviorTree references are valid", () => {
    const r = result.registries!;
    for (const entity of r.entityPrototypes.getAll() as readonly any[]) {
      if (entity.startingSkills) {
        for (const s of entity.startingSkills) {
          expect(
            r.skills.has(s.skillId),
            `Entity "${entity.id}" skill "${s.skillId}" not in skills`,
          ).toBe(true);
        }
      }
      if (entity.defaultTraits) {
        for (const tId of entity.defaultTraits) {
          expect(
            r.traits.has(tId),
            `Entity "${entity.id}" trait "${tId}" not in traits`,
          ).toBe(true);
        }
      }
      if (entity.defaultFactions) {
        for (const fId of entity.defaultFactions) {
          expect(
            r.factions.has(fId),
            `Entity "${entity.id}" faction "${fId}" not in factions`,
          ).toBe(true);
        }
      }
      if (entity.behaviorTree) {
        expect(
          r.behaviorTrees.has(entity.behaviorTree),
          `Entity "${entity.id}" behaviorTree "${entity.behaviorTree}" not in behaviorTrees`,
        ).toBe(true);
      }
    }
  });
});
