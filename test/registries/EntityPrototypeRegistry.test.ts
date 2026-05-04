import { describe, it, expect } from "vitest";
import { createEntityPrototypeRegistry } from "../../src/registries/EntityPrototypeRegistry.js";

describe("EntityPrototypeRegistry", () => {
  const registry = createEntityPrototypeRegistry();

  it("loads at least 36 entity prototypes", () => {
    expect(registry.size).toBeGreaterThanOrEqual(36);
  });

  it("contains humanoid prototypes", () => {
    const humanoids = registry.filter((e) => e.entityType === "humanoid");
    expect(humanoids.length).toBeGreaterThanOrEqual(23);
  });

  it("contains livestock prototypes", () => {
    const livestock = registry.filter((e) => e.entityType === "livestock");
    expect(livestock.length).toBeGreaterThanOrEqual(7);
  });

  it("contains wild animal prototypes", () => {
    const wild = registry.filter((e) => e.entityType === "wild_animal");
    expect(wild.length).toBeGreaterThanOrEqual(6);
  });

  it("blacksmith has correct starting skills and faction", () => {
    const blacksmith = registry.get("blacksmith");
    expect(blacksmith.startingSkills).toContainEqual({
      skillId: "smithing",
      level: 30,
    });
    expect(blacksmith.defaultFactions).toContain("guild_smiths");
  });

  it("merchant has sellsItems flag", () => {
    const merchant = registry.get("merchant");
    expect(merchant.sellsItems).toBe(true);
  });

  it("guard uses guard_patrol behavior tree", () => {
    const guard = registry.get("guard");
    expect(guard.behaviorTree).toBe("guard_patrol");
  });

  it("livestock have products defined", () => {
    const sheep = registry.get("sheep");
    expect(sheep.products).toBeDefined();
    expect(sheep.products!.length).toBeGreaterThan(0);
    expect(sheep.products![0].materialId).toBe("raw_wool");
  });

  it("wild animals have drops and threat levels", () => {
    const wolf = registry.get("wolf");
    expect(wolf.drops).toBeDefined();
    expect(wolf.drops!.length).toBeGreaterThan(0);
    expect(wolf.threatLevel).toBe("high");
  });

  it("has no duplicate IDs", () => {
    const all = registry.getAll();
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
