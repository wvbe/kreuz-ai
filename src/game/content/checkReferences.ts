import { subTreeReference } from "../behavior/BehaviorTreeRegistry";
import { BehaviorNodeType } from "../behavior/behaviorTypes";
import type { BehaviorNode } from "../behavior/behaviorTypes";
import { defaultCurrencyId } from "../inventory/MaterialRegistry";
import { Difficulty } from "../save/initOptions";
import {
  ContentFile,
  DwellingLevel,
  FurnitureRefKind,
  NeedSatisfactionKind,
  NotableMomentKind,
  SettlementTier,
  TierRequirementKind,
  TraitModifierKind,
  ZoneContextKind,
  SkillWildcard,
  moodNeedId,
} from "./contentTypes";
import type { ContentIssue } from "./contentTypes";
import type { ParsedContent } from "./parseContentPack";
import type { MaterialAmount } from "./schemas/fieldSchemas";

type Report = (file: ContentFile, id: string, field: string, message: string) => void;

function idSet(items: readonly { id: string }[]): Set<string> {
  return new Set(items.map((item) => item.id));
}

function collectTreeReferences(node: BehaviorNode, found: string[]): void {
  if (node.type === BehaviorNodeType.Selector || node.type === BehaviorNodeType.Sequence) {
    for (const child of node.children) {
      collectTreeReferences(child, found);
    }
    return;
  }
  const reference = subTreeReference(node);
  if (reference !== null) {
    found.push(reference);
  }
}

function checkCompleteness<Key extends string>(
  report: Report,
  file: ContentFile,
  present: readonly Key[],
  required: readonly Key[],
  label: string,
): void {
  for (const key of required) {
    if (!present.includes(key)) {
      report(file, key, label, `missing entry for ${label} "${key}"`);
    }
  }
}

/**
 * Referential-integrity pass over a schema-valid pack (spec 022 FR-015): every referenced id must
 * exist, enum-complete tables must have every key, the currency material must exist and name
 * lists must not clash with skill title nouns. Every issue names file, id and field. Count minima
 * and tier-reachability rules are corpus checks (DECISIONS D-15/D-16, task 5.4), not loader
 * errors.
 *
 * @param content - Schema-valid content.
 * @returns All issues found, in file order.
 */
export function checkReferences(content: ParsedContent): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const report: Report = (file, id, field, message) => issues.push({ file, id, field, message });

  const categories = idSet(content.categories);
  const terrain = idSet(content.terrain);
  const materials = idSet(content.materials);
  const needs = idSet(content.needs);
  const skills = idSet(content.skills);
  const furniture = idSet(content.furniture);
  const zones = idSet(content.zones);
  const factions = idSet(content.factions);
  const traits = idSet(content.traits);
  const trees = idSet(content.behaviorTrees);
  const nameLists = idSet(content.nameLists);
  const humanoids = idSet(content.humanoids);
  const furnitureTags = new Set(content.furniture.flatMap((piece) => piece.tags));

  const need = (
    set: Set<string>,
    file: ContentFile,
    id: string,
    field: string,
    value: string,
    what: string,
  ): void => {
    if (!set.has(value)) {
      report(file, id, field, `unknown ${what} "${value}"`);
    }
  };
  const amounts = (
    file: ContentFile,
    id: string,
    field: string,
    list: readonly MaterialAmount[],
  ): void => {
    list.forEach((entry, index) =>
      need(materials, file, id, `${field}.${index}.materialId`, entry.materialId, "material"),
    );
  };

  if (!materials.has(defaultCurrencyId)) {
    report(
      ContentFile.Materials,
      defaultCurrencyId,
      "id",
      `the currency material "${defaultCurrencyId}" is missing`,
    );
  }
  for (const material of content.materials) {
    material.categories.forEach((category, index) =>
      need(
        categories,
        ContentFile.Materials,
        material.id,
        `categories.${index}`,
        category,
        "category",
      ),
    );
  }
  for (const entry of content.terrain) {
    amounts(ContentFile.Terrain, entry.id, "harvestable", entry.harvestable);
    if (entry.clearsTo !== undefined) {
      need(terrain, ContentFile.Terrain, entry.id, "clearsTo", entry.clearsTo, "terrain");
    }
  }
  for (const entry of content.needs) {
    entry.satisfactionMethods.forEach((method, index) => {
      const target =
        method.kind === NeedSatisfactionKind.Item
          ? materials
          : method.kind === NeedSatisfactionKind.Furniture
            ? furniture
            : zones;
      need(
        target,
        ContentFile.Needs,
        entry.id,
        `satisfactionMethods.${index}.ref`,
        method.ref,
        method.kind,
      );
    });
  }
  for (const entry of content.traits) {
    entry.modifiers.forEach((modifier, index) => {
      const field = `modifiers.${index}`;
      if (modifier.kind === TraitModifierKind.NeedModifier) {
        if (modifier.need !== moodNeedId) {
          need(needs, ContentFile.Traits, entry.id, `${field}.need`, modifier.need, "need");
        }
      } else if (!(Object.values(SkillWildcard) as string[]).includes(modifier.skill)) {
        need(skills, ContentFile.Traits, entry.id, `${field}.skill`, modifier.skill, "skill");
      }
    });
  }
  for (const entry of content.furniture) {
    amounts(ContentFile.Furniture, entry.id, "constructionMaterials", entry.constructionMaterials);
    entry.storage?.categoryFilter.forEach((category, index) =>
      need(
        categories,
        ContentFile.Furniture,
        entry.id,
        `storage.categoryFilter.${index}`,
        category,
        "category",
      ),
    );
  }
  for (const entry of content.zones) {
    entry.furnitureRequirements.forEach((requirement, row) =>
      requirement.forEach((alternative, column) => {
        const field = `furnitureRequirements.${row}.${column}.ref`;
        if (alternative.kind === FurnitureRefKind.Id) {
          need(furniture, ContentFile.Zones, entry.id, field, alternative.ref, "furniture");
        } else {
          need(furnitureTags, ContentFile.Zones, entry.id, field, alternative.ref, "furniture tag");
        }
      }),
    );
    if (entry.skillAffinityId !== undefined) {
      need(skills, ContentFile.Zones, entry.id, "skillAffinityId", entry.skillAffinityId, "skill");
    }
    amounts(ContentFile.Zones, entry.id, "cropOutputs", entry.cropOutputs);
  }
  for (const entry of content.recipes) {
    amounts(ContentFile.Recipes, entry.id, "inputs", entry.inputs);
    amounts(ContentFile.Recipes, entry.id, "outputs", entry.outputs);
    need(
      furnitureTags,
      ContentFile.Recipes,
      entry.id,
      "workstationTag",
      entry.workstationTag,
      "workstation tag",
    );
    if (entry.skillId !== null) {
      need(skills, ContentFile.Recipes, entry.id, "skillId", entry.skillId, "skill");
    }
    entry.toolMaterialIds.forEach((tool, index) =>
      need(materials, ContentFile.Recipes, entry.id, `toolMaterialIds.${index}`, tool, "material"),
    );
    if (entry.roomZoneId !== undefined) {
      need(zones, ContentFile.Recipes, entry.id, "roomZoneId", entry.roomZoneId, "zone type");
    }
  }
  for (const entry of content.jobs) {
    if (entry.skillId !== null) {
      need(skills, ContentFile.Jobs, entry.id, "skillId", entry.skillId, "skill");
    }
    if (entry.toolMaterialId !== null) {
      need(
        materials,
        ContentFile.Jobs,
        entry.id,
        "toolMaterialId",
        entry.toolMaterialId,
        "material",
      );
    }
    const ref = entry.zoneContext.ref;
    if (ref !== undefined) {
      const zoneContext = entry.zoneContext.kind === ZoneContextKind.Zone;
      need(
        zoneContext ? zones : terrain,
        ContentFile.Jobs,
        entry.id,
        "zoneContext.ref",
        ref,
        zoneContext ? "zone type" : "terrain",
      );
    }
    amounts(ContentFile.Jobs, entry.id, "outputs", entry.outputs);
  }
  for (const entry of content.factions) {
    if (entry.membership !== undefined) {
      need(
        skills,
        ContentFile.Factions,
        entry.id,
        "membership.skillId",
        entry.membership.skillId,
        "skill",
      );
    }
    entry.associatedZoneIds.forEach((zone, index) =>
      need(zones, ContentFile.Factions, entry.id, `associatedZoneIds.${index}`, zone, "zone type"),
    );
  }

  const titleNouns = new Set(content.skills.map((skill) => skill.titleNoun.toLowerCase()));
  for (const list of content.nameLists) {
    list.bynames.forEach((byname, index) => {
      if (titleNouns.has(byname.toLowerCase())) {
        report(
          ContentFile.NameLists,
          list.id,
          `bynames.${index}`,
          `byname "${byname}" equals a skill title noun`,
        );
      }
    });
  }

  const treeReferences = (tree: { root: BehaviorNode }): string[] => {
    const found: string[] = [];
    collectTreeReferences(tree.root, found);
    return found;
  };
  for (const tree of content.behaviorTrees) {
    for (const reference of treeReferences(tree)) {
      need(
        trees,
        ContentFile.BehaviorTrees,
        tree.id,
        "root",
        reference,
        "behavior tree (run_tree)",
      );
    }
  }

  for (const entry of content.humanoids) {
    const file = ContentFile.HumanoidPrototypes;
    for (const skill of Object.keys(entry.startingSkills)) {
      need(skills, file, entry.id, `startingSkills.${skill}`, skill, "skill");
    }
    amounts(file, entry.id, "equipment", entry.equipment);
    entry.defaultFactionIds.forEach((faction, index) =>
      need(factions, file, entry.id, `defaultFactionIds.${index}`, faction, "faction"),
    );
    entry.defaultTraitIds.forEach((trait, index) =>
      need(traits, file, entry.id, `defaultTraitIds.${index}`, trait, "trait"),
    );
    entry.needPriority?.forEach((needId, index) =>
      need(needs, file, entry.id, `needPriority.${index}`, needId, "need"),
    );
    need(nameLists, file, entry.id, "nameListId", entry.nameListId, "name list");
    need(trees, file, entry.id, "behaviorTreeId", entry.behaviorTreeId, "behavior tree");
    const stackLimits = new Map(
      content.materials.map((material) => [material.id, material.stackLimit]),
    );
    const slotsNeeded = entry.equipment.reduce(
      (total, item) =>
        total + Math.ceil(item.quantity / (stackLimits.get(item.materialId) ?? Infinity)),
      0,
    );
    if (slotsNeeded > entry.inventorySlots) {
      report(
        file,
        entry.id,
        "equipment",
        `needs ${slotsNeeded} inventory slots but inventorySlots is ${entry.inventorySlots}`,
      );
    }
  }
  for (const entry of content.animals) {
    const file = ContentFile.AnimalPrototypes;
    amounts(file, entry.id, "products", entry.products);
    amounts(file, entry.id, "drops", entry.drops);
    if (entry.tendingSkillId !== undefined) {
      need(skills, file, entry.id, "tendingSkillId", entry.tendingSkillId, "skill");
    }
    if (entry.zoneId !== undefined) {
      need(zones, file, entry.id, "zoneId", entry.zoneId, "zone type");
    }
    entry.habitatTerrainIds.forEach((id, index) =>
      need(terrain, file, entry.id, `habitatTerrainIds.${index}`, id, "terrain"),
    );
    need(trees, file, entry.id, "behaviorTreeId", entry.behaviorTreeId, "behavior tree");
  }

  const dwellingFile = ContentFile.DwellingLevels;
  checkCompleteness(
    report,
    dwellingFile,
    content.dwellingLevels.map((level) => level.level),
    Object.values(DwellingLevel),
    "level",
  );
  for (const level of content.dwellingLevels) {
    level.furniture.forEach((piece, index) =>
      need(
        piece.kind === FurnitureRefKind.Id ? furniture : furnitureTags,
        dwellingFile,
        level.level,
        `furniture.${index}.ref`,
        piece.ref,
        piece.kind === FurnitureRefKind.Id ? "furniture" : "furniture tag",
      ),
    );
    level.services.forEach((service, row) =>
      service.zoneTypeIds.forEach((zone, column) =>
        need(
          zones,
          dwellingFile,
          level.level,
          `services.${row}.zoneTypeIds.${column}`,
          zone,
          "zone type",
        ),
      ),
    );
    level.suppliedGoods.forEach((goods, row) =>
      goods.materialIds.forEach((material, column) =>
        need(
          materials,
          dwellingFile,
          level.level,
          `suppliedGoods.${row}.materialIds.${column}`,
          material,
          "material",
        ),
      ),
    );
    level.immigrantPrototypes.forEach((entry, index) =>
      need(
        humanoids,
        dwellingFile,
        level.level,
        `immigrantPrototypes.${index}.prototypeId`,
        entry.prototypeId,
        "humanoid prototype",
      ),
    );
  }

  checkCompleteness(
    report,
    ContentFile.SettlementTiers,
    content.settlementTiers.map((tier) => tier.tier),
    Object.values(SettlementTier),
    "tier",
  );
  for (const tier of content.settlementTiers) {
    tier.requirements.forEach((requirement, row) => {
      if (requirement.kind === TierRequirementKind.ActiveZone) {
        requirement.zoneTypeIds.forEach((zone, column) =>
          need(
            zones,
            ContentFile.SettlementTiers,
            tier.tier,
            `requirements.${row}.zoneTypeIds.${column}`,
            zone,
            "zone type",
          ),
        );
      }
    });
  }
  checkCompleteness(
    report,
    ContentFile.DifficultyModes,
    content.difficultyModes.map((mode) => mode.difficulty),
    Object.values(Difficulty),
    "difficulty",
  );
  checkCompleteness(
    report,
    ContentFile.MomentTemplates,
    content.momentTemplates.map((entry) => entry.kind),
    Object.values(NotableMomentKind),
    "kind",
  );
  return issues;
}
