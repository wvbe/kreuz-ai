import { describe, expect, it } from "vitest";
import { BehaviorHandlerRegistry } from "../behavior/BehaviorHandlerRegistry";
import { NodeStatus } from "../behavior/behaviorTypes";
import { isJsonObject } from "../ecs/jsonData";
import type { JsonValue } from "../engine/EventBus";
import { bundledContentFiles, loadContent, loadContentPack } from "./ContentLoader";
import { ContentValidationError } from "./ContentValidationError";
import { ContentFile } from "./contentTypes";
import type { ContentIssue, ContentPackFiles } from "./contentTypes";

function clonePack(): ContentPackFiles {
  return structuredClone(bundledContentFiles);
}

function records(pack: ContentPackFiles, file: ContentFile): { [key: string]: JsonValue }[] {
  const list = pack[file];
  if (!Array.isArray(list)) {
    throw new Error(`${file} is not a list`);
  }
  return list.map((entry) => {
    if (!isJsonObject(entry)) {
      throw new Error("record is not an object");
    }
    return entry;
  });
}

function loadIssues(pack: ContentPackFiles): readonly ContentIssue[] {
  try {
    loadContentPack(pack);
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return error.issues;
    }
    throw error;
  }
  throw new Error("expected the pack to be rejected");
}

describe("loadContent (vertical-slice pack v0)", () => {
  it("loads without errors and exposes every category", () => {
    const content = loadContent();
    expect(content.terrain.ids()).toHaveLength(11);
    expect(content.materials.ids()).toHaveLength(14);
    expect(content.needs.size).toBe(6);
    expect(content.skills.size).toBe(8);
    expect(content.traits.size).toBe(7);
    expect(content.humanoids.ids()).toEqual(["baker", "carpenter", "farmer", "peasant"]);
    expect(content.behaviorTrees.ids()).toEqual(["basic_needs", "idle_wander"]);
    expect(content.enginePrototypes.has("government_faction")).toBe(true);
    expect(content.nameLists.require("common_13c").givenNames.length).toBeGreaterThanOrEqual(60);
    expect(content.nameLists.require("common_13c").bynames.length).toBeGreaterThanOrEqual(40);
    expect(content.materials.currencyId).toBe("silver_penny");
  });

  it("converts authored decimals to fixed point", () => {
    const content = loadContent();
    expect(content.materials.require("bread").valueMilli).toBe(2000);
    expect(content.materials.require("nails").valueMilli).toBe(200);
    expect(content.materials.require("silver_penny").weightMilli).toBe(10);
    expect(content.needs.require("hunger").decayPerTick).toBe(100);
    expect(content.needs.require("hunger").criticalThreshold).toBe(20000);
    expect(content.needs.require("rest").satisfactionMethods[0]?.amount).toBe(1200);
    expect(content.skills.require("farming").diminishingFactor).toBe(250);
    expect(content.humanoids.require("farmer").startingSkills).toEqual({
      farming: 30000,
      hauling: 10000,
    });
    expect(content.difficultyModes.require("harsh").factionHostilityMultiplier).toBe(1500);
    expect(content.constants.bynameChance).toBe(850);
    expect(content.constants.needStartValue).toBe(80000);
  });

  it("returns independent registries on every load", () => {
    const first = loadContent();
    const second = loadContent();
    expect(first).not.toBe(second);
    expect(first.materials).not.toBe(second.materials);
    expect(first.terrain).not.toBe(second.terrain);
    expect(first.skills).not.toBe(second.skills);
    first.materials.register({
      id: "extra_item",
      name: "Extra",
      categories: [],
      stackLimit: 1,
      weightMilli: 0,
    });
    expect(first.materials.has("extra_item")).toBe(true);
    expect(second.materials.has("extra_item")).toBe(false);
  });

  it("freezes loaded records", () => {
    const content = loadContent();
    expect(Object.isFrozen(content.skills.require("farming"))).toBe(true);
    expect(Object.isFrozen(content.constants)).toBe(true);
  });

  it("checks behavior tree handlers when a handler registry is given", () => {
    const handlers = new BehaviorHandlerRegistry();
    expect(() => loadContent({ handlers })).toThrow(ContentValidationError);
    handlers.registerCondition("any_need_below_critical", () => NodeStatus.Failure);
    handlers.registerAction("satisfy_critical_need", () => NodeStatus.Success);
    handlers.registerAction("idle_wander", () => NodeStatus.Success);
    expect(() => loadContent({ handlers })).not.toThrow();
    const issues = (() => {
      const partial = new BehaviorHandlerRegistry();
      try {
        loadContent({ handlers: partial });
      } catch (error) {
        return error instanceof ContentValidationError ? error.issues : [];
      }
      return [];
    })();
    expect(issues[0]?.file).toBe(ContentFile.BehaviorTrees);
    expect(issues[0]?.id).toMatch(/^(basic_needs|idle_wander)$/);
  });
});

describe("loadContentPack", () => {
  it("loads from parsed JSON without touching the filesystem", () => {
    const content = loadContentPack(clonePack());
    expect(content.skills.require("baking").titleNoun).toBe("Baker");
  });

  it("reports a missing file and a non-list file", () => {
    const pack = clonePack();
    delete pack[ContentFile.Skills];
    pack[ContentFile.Needs] = { not: "a list" };
    const issues = loadIssues(pack);
    expect(issues).toContainEqual(expect.objectContaining({ file: ContentFile.Skills, id: null }));
    expect(issues).toContainEqual(expect.objectContaining({ file: ContentFile.Needs, id: null }));
  });

  it("rejects duplicate ids naming file, id and field", () => {
    const pack = clonePack();
    const skills = records(pack, ContentFile.Skills);
    skills.push(structuredClone(skills[0] ?? {}));
    pack[ContentFile.Skills] = skills;
    expect(loadIssues(pack)).toEqual([
      {
        file: ContentFile.Skills,
        id: "farming",
        field: "id",
        message: 'duplicate id "farming"',
      },
    ]);
  });

  it("collects errors of several files in one pass", () => {
    const pack = clonePack();
    const need = records(pack, ContentFile.Needs)[0];
    const skill = records(pack, ContentFile.Skills)[0];
    if (need) need["criticalThreshold"] = 150;
    if (skill) skill["titleNoun"] = "";
    const issues = loadIssues(pack);
    expect(issues.map((issue) => issue.file)).toEqual([ContentFile.Needs, ContentFile.Skills]);
    expect(issues[0]).toMatchObject({ id: "hunger", field: "criticalThreshold" });
    expect(issues[1]).toMatchObject({ id: "farming", field: "titleNoun" });
  });

  it("reports a decimal that cannot be represented exactly", () => {
    const pack = clonePack();
    const bread = records(pack, ContentFile.Materials).find((entry) => entry["id"] === "bread");
    if (bread) bread["value"] = 0.0001;
    expect(loadIssues(pack)).toContainEqual(
      expect.objectContaining({ file: ContentFile.Materials, id: "bread" }),
    );
  });
});

type InvalidCase = {
  file: ContentFile;
  id: string;
  field: string;
  mutate: (record: { [key: string]: JsonValue }) => void;
};

const invalidCases: { [label: string]: InvalidCase } = {
  category: {
    file: ContentFile.Categories,
    id: "raw",
    field: "id",
    mutate: (record) => (record["id"] = "Raw"),
  },
  terrain: {
    file: ContentFile.Terrain,
    id: "water_shallow",
    field: "",
    mutate: (record) => (record["blockReason"] = null),
  },
  material: {
    file: ContentFile.Materials,
    id: "oak_log",
    field: "stackLimit",
    mutate: (record) => (record["stackLimit"] = 0),
  },
  need: {
    file: ContentFile.Needs,
    id: "rest",
    field: "decayPerTick",
    mutate: (record) => (record["decayPerTick"] = -1),
  },
  skill: {
    file: ContentFile.Skills,
    id: "baking",
    field: "diminishingReturnsThreshold",
    mutate: (record) => (record["diminishingReturnsThreshold"] = 101),
  },
  trait: {
    file: ContentFile.Traits,
    id: "strong",
    field: "modifiers",
    mutate: (record) => (record["modifiers"] = []),
  },
  furniture: {
    file: ContentFile.Furniture,
    id: "chest",
    field: "storage.slotCount",
    mutate: (record) => (record["storage"] = { slotCount: 0 }),
  },
  zone: {
    file: ContentFile.Zones,
    id: "bakery",
    field: "requiresRoom",
    mutate: (record) => (record["requiresRoom"] = "yes"),
  },
  recipe: {
    file: ContentFile.Recipes,
    id: "bake_bread",
    field: "outputs",
    mutate: (record) => (record["outputs"] = []),
  },
  job: {
    file: ContentFile.Jobs,
    id: "farm.sow",
    field: "recurrence",
    mutate: (record) => (record["recurrence"] = "sometimes"),
  },
  faction: {
    file: ContentFile.Factions,
    id: "guild_bakers",
    field: "masterSkillThreshold",
    mutate: (record) => (record["masterSkillThreshold"] = 10),
  },
  "behavior tree": {
    file: ContentFile.BehaviorTrees,
    id: "idle_wander",
    field: "root",
    mutate: (record) => (record["root"] = { type: "loop" }),
  },
  "name list": {
    file: ContentFile.NameLists,
    id: "common_13c",
    field: "bynames",
    mutate: (record) => (record["bynames"] = ["Hill", "hill"]),
  },
  humanoid: {
    file: ContentFile.HumanoidPrototypes,
    id: "farmer",
    field: "traitSlots",
    mutate: (record) => (record["traitSlots"] = 4),
  },
  "engine prototype": {
    file: ContentFile.EnginePrototypes,
    id: "wall",
    field: "id",
    mutate: (record) => (record["id"] = "Wall"),
  },
  "dwelling level": {
    file: ContentFile.DwellingLevels,
    id: "hovel",
    field: "capacity",
    mutate: (record) => (record["capacity"] = 0),
  },
  "settlement tier": {
    file: ContentFile.SettlementTiers,
    id: "village",
    field: "requirements.0.kind",
    mutate: (record) => (record["requirements"] = [{ kind: "wealth", min: 1 }]),
  },
  "difficulty mode": {
    file: ContentFile.DifficultyModes,
    id: "harsh",
    field: "decayMultiplier",
    mutate: (record) => (record["decayMultiplier"] = -1),
  },
  "moment template": {
    file: ContentFile.MomentTemplates,
    id: "died",
    field: "template",
    mutate: (record) => (record["template"] = ""),
  },
};

describe("invalid records per category", () => {
  for (const [label, invalid] of Object.entries(invalidCases)) {
    it(`rejects an invalid ${label} naming file, id and field`, () => {
      const pack = clonePack();
      const target = records(pack, invalid.file).find((entry) => {
        const key =
          entry["id"] ?? entry["level"] ?? entry["tier"] ?? entry["difficulty"] ?? entry["kind"];
        return key === invalid.id;
      });
      if (!target) {
        throw new Error(`fixture ${invalid.id} not found`);
      }
      invalid.mutate(target);
      const issues = loadIssues(pack);
      expect(issues.length).toBeGreaterThan(0);
      const issue = issues[0];
      expect(issue?.file).toBe(invalid.file);
      expect(issue?.field.startsWith(invalid.field)).toBe(true);
      if (label !== "engine prototype" && label !== "category") {
        expect(issue?.id).toBe(invalid.id);
      }
    });
  }

  it("rejects an invalid constants file and name formats file", () => {
    const pack = clonePack();
    pack[ContentFile.ContentConstants] = { stewardReviewTickOfDay: 400 };
    pack[ContentFile.NameFormats] = { plain: "" };
    const files = loadIssues(pack).map((issue) => issue.file);
    expect(files).toContain(ContentFile.ContentConstants);
    expect(files).toContain(ContentFile.NameFormats);
  });

  it("rejects constants where downgrade grace does not exceed upgrade grace", () => {
    const pack = clonePack();
    const constants = pack[ContentFile.ContentConstants];
    if (!isJsonObject(constants)) throw new Error("constants missing");
    constants["downgradeGraceDays"] = 3;
    expect(loadIssues(pack)).toContainEqual(
      expect.objectContaining({ file: ContentFile.ContentConstants, field: "downgradeGraceDays" }),
    );
  });
});

type DanglingCase = {
  file: ContentFile;
  id: string;
  field: string;
  mutate: (record: { [key: string]: JsonValue }) => void;
};

const danglingCases: { [label: string]: DanglingCase } = {
  "material category": {
    file: ContentFile.Materials,
    id: "bread",
    field: "categories.0",
    mutate: (record) => (record["categories"] = ["no_such_category"]),
  },
  "terrain harvestable": {
    file: ContentFile.Terrain,
    id: "forest_oak",
    field: "harvestable.0.materialId",
    mutate: (record) => (record["harvestable"] = [{ materialId: "mithril", quantity: 1 }]),
  },
  "terrain clearsTo": {
    file: ContentFile.Terrain,
    id: "forest_oak",
    field: "clearsTo",
    mutate: (record) => (record["clearsTo"] = "lava"),
  },
  "need satisfaction": {
    file: ContentFile.Needs,
    id: "hunger",
    field: "satisfactionMethods.0.ref",
    mutate: (record) =>
      (record["satisfactionMethods"] = [{ kind: "item", ref: "manna", amount: 10 }]),
  },
  "trait skill": {
    file: ContentFile.Traits,
    id: "born_baker",
    field: "modifiers.0.skill",
    mutate: (record) =>
      (record["modifiers"] = [{ kind: "skill_aptitude", skill: "alchemy", growthMultiplier: 2 }]),
  },
  "trait need": {
    file: ContentFile.Traits,
    id: "hearty",
    field: "modifiers.0.need",
    mutate: (record) =>
      (record["modifiers"] = [{ kind: "need_modifier", need: "thirst", decayRateMultiplier: 1 }]),
  },
  "furniture material": {
    file: ContentFile.Furniture,
    id: "table",
    field: "constructionMaterials.0.materialId",
    mutate: (record) =>
      (record["constructionMaterials"] = [{ materialId: "adamant", quantity: 1 }]),
  },
  "zone furniture tag": {
    file: ContentFile.Zones,
    id: "bedroom",
    field: "furnitureRequirements.0.0.ref",
    mutate: (record) =>
      (record["furnitureRequirements"] = [[{ kind: "tag", ref: "throne", count: 1 }]]),
  },
  "recipe workstation": {
    file: ContentFile.Recipes,
    id: "saw_oak_planks",
    field: "workstationTag",
    mutate: (record) => (record["workstationTag"] = "anvil"),
  },
  "recipe input": {
    file: ContentFile.Recipes,
    id: "grind_flour",
    field: "inputs.0.materialId",
    mutate: (record) => (record["inputs"] = [{ materialId: "rye", quantity: 1 }]),
  },
  "recipe skill": {
    file: ContentFile.Recipes,
    id: "grind_flour",
    field: "skillId",
    mutate: (record) => (record["skillId"] = "milling"),
  },
  "job tool": {
    file: ContentFile.Jobs,
    id: "build.construct",
    field: "toolMaterialId",
    mutate: (record) => (record["toolMaterialId"] = "trowel"),
  },
  "job zone": {
    file: ContentFile.Jobs,
    id: "farm.sow",
    field: "zoneContext.ref",
    mutate: (record) => (record["zoneContext"] = { kind: "zone", ref: "orchard" }),
  },
  "faction skill": {
    file: ContentFile.Factions,
    id: "guild_bakers",
    field: "membership.skillId",
    mutate: (record) => (record["membership"] = { skillId: "brewing", minLevel: 5 }),
  },
  "behavior tree reference": {
    file: ContentFile.BehaviorTrees,
    id: "basic_needs",
    field: "root",
    mutate: (record) =>
      (record["root"] = {
        type: "action",
        id: "run_tree",
        params: { treeId: "missing_tree" },
      }),
  },
  "humanoid skill": {
    file: ContentFile.HumanoidPrototypes,
    id: "farmer",
    field: "startingSkills.sorcery",
    mutate: (record) => (record["startingSkills"] = { sorcery: 10 }),
  },
  "humanoid faction": {
    file: ContentFile.HumanoidPrototypes,
    id: "baker",
    field: "defaultFactionIds.0",
    mutate: (record) => (record["defaultFactionIds"] = ["guild_wizards"]),
  },
  "humanoid trait": {
    file: ContentFile.HumanoidPrototypes,
    id: "baker",
    field: "defaultTraitIds.0",
    mutate: (record) => (record["defaultTraitIds"] = ["lucky"]),
  },
  "humanoid equipment": {
    file: ContentFile.HumanoidPrototypes,
    id: "carpenter",
    field: "equipment.0.materialId",
    mutate: (record) => (record["equipment"] = [{ materialId: "sword", quantity: 1 }]),
  },
  "humanoid tree": {
    file: ContentFile.HumanoidPrototypes,
    id: "peasant",
    field: "behaviorTreeId",
    mutate: (record) => (record["behaviorTreeId"] = "no_tree"),
  },
  "humanoid name list": {
    file: ContentFile.HumanoidPrototypes,
    id: "peasant",
    field: "nameListId",
    mutate: (record) => (record["nameListId"] = "elvish"),
  },
  "humanoid equipment slots": {
    file: ContentFile.HumanoidPrototypes,
    id: "carpenter",
    field: "equipment",
    mutate: (record) => (record["inventorySlots"] = 1),
  },
  "dwelling immigrant": {
    file: ContentFile.DwellingLevels,
    id: "hovel",
    field: "immigrantPrototypes.0.prototypeId",
    mutate: (record) => (record["immigrantPrototypes"] = [{ prototypeId: "knight", weight: 1 }]),
  },
  "tier zone": {
    file: ContentFile.SettlementTiers,
    id: "village",
    field: "requirements.2.zoneTypeIds.0",
    mutate: (record) =>
      (record["requirements"] = [
        { kind: "population", min: 1 },
        { kind: "population", min: 2 },
        { kind: "active_zone", zoneTypeIds: ["castle"], min: 1 },
      ]),
  },
};

describe("dangling references", () => {
  for (const [label, dangling] of Object.entries(danglingCases)) {
    it(`rejects a dangling ${label} naming file, id and field`, () => {
      const pack = clonePack();
      const target = records(pack, dangling.file).find((entry) => {
        const key = entry["id"] ?? entry["level"] ?? entry["tier"];
        return key === dangling.id;
      });
      if (!target) {
        throw new Error(`fixture ${dangling.id} not found`);
      }
      dangling.mutate(target);
      const issues = loadIssues(pack);
      expect(issues).toContainEqual(
        expect.objectContaining({ file: dangling.file, id: dangling.id, field: dangling.field }),
      );
    });
  }

  it("rejects a pack without the currency material", () => {
    const pack = clonePack();
    pack[ContentFile.Materials] = records(pack, ContentFile.Materials).filter(
      (entry) => entry["id"] !== "silver_penny",
    );
    expect(loadIssues(pack)).toContainEqual(
      expect.objectContaining({ file: ContentFile.Materials, id: "silver_penny" }),
    );
  });

  it("rejects incomplete enum tables (tiers, difficulties, dwelling levels, moments)", () => {
    const pack = clonePack();
    pack[ContentFile.SettlementTiers] = records(pack, ContentFile.SettlementTiers).slice(0, 3);
    pack[ContentFile.DifficultyModes] = records(pack, ContentFile.DifficultyModes).slice(1);
    pack[ContentFile.DwellingLevels] = records(pack, ContentFile.DwellingLevels).slice(0, 2);
    pack[ContentFile.MomentTemplates] = records(pack, ContentFile.MomentTemplates).slice(1);
    const issues = loadIssues(pack);
    expect(issues).toContainEqual(
      expect.objectContaining({ file: ContentFile.SettlementTiers, id: "chartered_town" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ file: ContentFile.DifficultyModes, id: "peaceful" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ file: ContentFile.DwellingLevels, id: "burgher_house" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ file: ContentFile.MomentTemplates, id: "arrived" }),
    );
  });

  it("formats the error message with one line per issue", () => {
    const pack = clonePack();
    const bread = records(pack, ContentFile.Materials).find((entry) => entry["id"] === "bread");
    if (bread) bread["categories"] = ["nope"];
    try {
      loadContentPack(pack);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as Error).message).toContain(
        'materials.json [bread] categories.0: unknown category "nope"',
      );
    }
  });
});
