import type { ContentRegistries } from "../content/ContentRegistries";
import {
  FurnitureRefKind,
  SkillWildcard,
  TraitModifierKind,
  ZoneContextKind,
} from "../content/contentTypes";
import type { JsonValue } from "../engine/EventBus";

/**
 * The content categories the content browser lists (`content-registries` and `content-entry`).
 * The value is the serialized kind.
 */
export enum ContentKind {
  Material = "material",
  Recipe = "recipe",
  Furniture = "furniture",
  Zone = "zone",
  Skill = "skill",
  Trait = "trait",
  Job = "job",
  Animal = "animal",
  Humanoid = "humanoid",
  NameList = "name_list",
  Terrain = "terrain",
  Faction = "faction",
  Need = "need",
  Behavior = "behavior",
}

/**
 * One row of a content category.
 */
export type ContentRow = {
  id: string;
  name: string;
  /**
   * The settlement tier that unlocks the entry, or null when it is available from the start.
   */
  unlockTier: string | null;
};

/**
 * One category of the `content-registries` query.
 */
export type ContentCategoryView = {
  kind: ContentKind;
  label: string;
  entries: readonly ContentRow[];
};

/**
 * The `content-registries` query: every content category with its entries (id, name, unlock tier).
 */
export type ContentRegistriesView = { categories: readonly ContentCategoryView[] };

/**
 * A reference between two content entries, for example a recipe and one of its inputs.
 */
export type ContentLink = {
  kind: ContentKind;
  id: string;
  name: string;
  /**
   * How the two are related, from the point of view of the entry the link is listed on
   * (`input`, `output`, `workstation`, ...).
   */
  role: string;
};

/**
 * The `content-entry` query: one entry with its definition and both directions of its links.
 */
export type ContentEntryView = {
  kind: ContentKind;
  id: string;
  name: string;
  unlockTier: string | null;
  /**
   * The definition as loaded (JSON; amounts in thousandths as the content stores them).
   */
  fields: { readonly [name: string]: JsonValue };
  /**
   * What this entry refers to (a recipe's inputs and outputs, ...).
   */
  links: readonly ContentLink[];
  /**
   * What refers to this entry (the recipes that use a material, the recipes a workbench
   * enables, ...): the reverse index.
   */
  usedBy: readonly ContentLink[];
};

type Reference = { kind: ContentKind; id: string; role: string };

type Described = { id: string; name: string; record: { readonly [name: string]: JsonValue } };

type Catalogue = {
  kind: ContentKind;
  label: string;
  entries: readonly Described[];
};

function plain(record: object): { readonly [name: string]: JsonValue } {
  // Content records are frozen JSON-like objects; the copy drops undefined optionals.
  return JSON.parse(JSON.stringify(record)) as { [name: string]: JsonValue };
}

function describe<Item extends { id: string; name: string }>(items: readonly Item[]): Described[] {
  return items.map((item) => ({ id: item.id, name: item.name, record: plain(item) }));
}

function buildCatalogues(content: ContentRegistries): readonly Catalogue[] {
  return [
    {
      kind: ContentKind.Material,
      label: "Materials",
      entries: describe(content.materials.ids().map((id) => content.materials.require(id))),
    },
    { kind: ContentKind.Recipe, label: "Recipes", entries: describe(content.recipes.all()) },
    { kind: ContentKind.Furniture, label: "Furniture", entries: describe(content.furniture.all()) },
    { kind: ContentKind.Zone, label: "Zone types", entries: describe(content.zones.all()) },
    { kind: ContentKind.Skill, label: "Skills", entries: describe(content.skills.all()) },
    { kind: ContentKind.Trait, label: "Traits", entries: describe(content.traits.all()) },
    { kind: ContentKind.Job, label: "Jobs", entries: describe(content.jobs.all()) },
    { kind: ContentKind.Animal, label: "Animals", entries: describe(content.animals.all()) },
    {
      kind: ContentKind.Humanoid,
      label: "Humanoids",
      entries: describe(content.humanoids.all()),
    },
    {
      kind: ContentKind.NameList,
      label: "Name lists",
      entries: content.nameLists.all().map((list) => ({
        id: list.id,
        name: list.id,
        record: plain(list),
      })),
    },
    {
      kind: ContentKind.Terrain,
      label: "Terrain",
      entries: describe(content.terrainContent.all()),
    },
    { kind: ContentKind.Faction, label: "Factions", entries: describe(content.factions.all()) },
    { kind: ContentKind.Need, label: "Needs", entries: describe(content.needs.all()) },
    {
      kind: ContentKind.Behavior,
      label: "Behaviors",
      entries: content.behaviorTrees
        .all()
        .map((tree) => ({ id: tree.id, name: tree.id, record: plain(tree) })),
    },
  ];
}

function unlockTierOf(record: { readonly [name: string]: JsonValue }): string | null {
  const tier = record["unlockTier"];
  return typeof tier === "string" ? tier : null;
}

function amountRefs(amounts: readonly { materialId: string }[], role: string): Reference[] {
  return amounts.map((amount) => ({ kind: ContentKind.Material, id: amount.materialId, role }));
}

function furnitureWithTag(content: ContentRegistries, tag: string): string[] {
  return content.furniture
    .all()
    .filter((furniture) => furniture.tags.includes(tag))
    .map((furniture) => furniture.id);
}

function skillRef(id: string | null | undefined, role: string): Reference[] {
  return id === undefined || id === null || Object.values<string>(SkillWildcard).includes(id)
    ? []
    : [{ kind: ContentKind.Skill, id, role }];
}

/**
 * The outgoing references of one entry; the reverse index is derived from them.
 *
 * @param content - The loaded content.
 * @param kind - The category of the entry.
 * @param id - The entry id.
 * @returns What the entry refers to, each with its role.
 */
function outgoing(content: ContentRegistries, kind: ContentKind, id: string): Reference[] {
  switch (kind) {
    case ContentKind.Recipe: {
      const recipe = content.recipes.require(id);
      return [
        ...amountRefs(recipe.inputs, "input"),
        ...amountRefs(recipe.outputs, "output"),
        ...recipe.toolMaterialIds.map((tool) => ({
          kind: ContentKind.Material,
          id: tool,
          role: "tool",
        })),
        ...furnitureWithTag(content, recipe.workstationTag).map((furniture) => ({
          kind: ContentKind.Furniture,
          id: furniture,
          role: "workstation",
        })),
        ...skillRef(recipe.skillId, "skill"),
        ...(recipe.roomZoneId === undefined
          ? []
          : [{ kind: ContentKind.Zone, id: recipe.roomZoneId, role: "room" }]),
      ];
    }
    case ContentKind.Furniture: {
      const furniture = content.furniture.require(id);
      return [
        ...amountRefs(furniture.constructionMaterials, "built from"),
        ...amountRefs(furniture.deconstructionYield, "yields"),
      ];
    }
    case ContentKind.Zone: {
      const zone = content.zones.require(id);
      const required = zone.furnitureRequirements.flatMap((group) =>
        group.flatMap((alternative) =>
          alternative.kind === FurnitureRefKind.Id
            ? [alternative.ref]
            : furnitureWithTag(content, alternative.ref),
        ),
      );
      return [
        ...required.map((furniture) => ({
          kind: ContentKind.Furniture,
          id: furniture,
          role: "requires",
        })),
        ...skillRef(zone.skillAffinityId, "skill affinity"),
        ...amountRefs(zone.cropOutputs, "crop"),
        ...(zone.cropTerrainId === undefined
          ? []
          : [{ kind: ContentKind.Terrain, id: zone.cropTerrainId, role: "grows on" }]),
        ...(zone.harvestJobId === undefined
          ? []
          : [{ kind: ContentKind.Job, id: zone.harvestJobId, role: "harvest job" }]),
      ];
    }
    case ContentKind.Trait: {
      const trait = content.traits.require(id);
      return [
        ...trait.conflictsWith.map((other) => ({
          kind: ContentKind.Trait,
          id: other,
          role: "conflicts with",
        })),
        ...trait.modifiers.flatMap((modifier): Reference[] =>
          modifier.kind === TraitModifierKind.NeedModifier
            ? [{ kind: ContentKind.Need, id: modifier.need, role: "modifies" }]
            : skillRef(modifier.skill, "modifies"),
        ),
      ];
    }
    case ContentKind.Job: {
      const job = content.jobs.require(id);
      const context = job.zoneContext;
      return [
        ...skillRef(job.skillId, "skill"),
        ...(job.toolMaterialId === null
          ? []
          : [{ kind: ContentKind.Material, id: job.toolMaterialId, role: "tool" }]),
        ...amountRefs(job.outputs, "output"),
        ...(context.kind === ZoneContextKind.Zone && context.ref !== undefined
          ? [{ kind: ContentKind.Zone, id: context.ref, role: "worked in" }]
          : context.kind === ZoneContextKind.Terrain && context.ref !== undefined
            ? [{ kind: ContentKind.Terrain, id: context.ref, role: "worked on" }]
            : []),
      ];
    }
    case ContentKind.Animal: {
      const animal = content.animals.require(id);
      return [
        ...amountRefs(animal.products, "product"),
        ...amountRefs(animal.drops, "drop"),
        ...animal.habitatTerrainIds.map((terrain) => ({
          kind: ContentKind.Terrain,
          id: terrain,
          role: "habitat",
        })),
        ...animal.dietTerrainIds.map((terrain) => ({
          kind: ContentKind.Terrain,
          id: terrain,
          role: "grazes",
        })),
        ...animal.preyIds.map((prey) => ({ kind: ContentKind.Animal, id: prey, role: "prey" })),
        ...skillRef(animal.tendingSkillId, "tended with"),
        ...(animal.zoneId === undefined
          ? []
          : [{ kind: ContentKind.Zone, id: animal.zoneId, role: "kept in" }]),
      ];
    }
    case ContentKind.Humanoid: {
      const humanoid = content.humanoids.require(id);
      return [
        ...Object.keys(humanoid.startingSkills).map((skill) => ({
          kind: ContentKind.Skill,
          id: skill,
          role: "starts with",
        })),
        ...amountRefs(humanoid.equipment, "equipment"),
        ...humanoid.defaultFactionIds.map((faction) => ({
          kind: ContentKind.Faction,
          id: faction,
          role: "member of",
        })),
        ...humanoid.defaultTraitIds.map((trait) => ({
          kind: ContentKind.Trait,
          id: trait,
          role: "trait",
        })),
        { kind: ContentKind.Behavior, id: humanoid.behaviorTreeId, role: "behaves by" },
        { kind: ContentKind.NameList, id: humanoid.nameListId, role: "names from" },
      ];
    }
    case ContentKind.Terrain: {
      const terrain = content.terrainContent.require(id);
      return [
        ...amountRefs(terrain.harvestable, "harvest"),
        ...(terrain.clearsTo === undefined
          ? []
          : [{ kind: ContentKind.Terrain, id: terrain.clearsTo, role: "clears to" }]),
      ];
    }
    case ContentKind.Faction: {
      const faction = content.factions.require(id);
      return [
        ...faction.associatedZoneIds.map((zone) => ({
          kind: ContentKind.Zone,
          id: zone,
          role: "associated zone",
        })),
        ...skillRef(faction.membership?.skillId, "membership skill"),
      ];
    }
    default:
      return [];
  }
}

/**
 * Builds the `content-registries` view.
 *
 * @param content - The loaded content of the engine.
 * @returns Every category with its entries.
 */
export function buildContentRegistriesView(content: ContentRegistries): ContentRegistriesView {
  return {
    categories: buildCatalogues(content).map((catalogue) => ({
      kind: catalogue.kind,
      label: catalogue.label,
      entries: catalogue.entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        unlockTier: unlockTierOf(entry.record),
      })),
    })),
  };
}

/**
 * Builds the `content-entry` view: the definition, what it refers to and what refers to it.
 *
 * @param content - The loaded content of the engine.
 * @param kind - The category.
 * @param id - The entry id.
 * @returns The view, or null when the category has no such entry.
 */
export function buildContentEntryView(
  content: ContentRegistries,
  kind: ContentKind,
  id: string,
): ContentEntryView | null {
  const catalogues = buildCatalogues(content);
  const nameOf = (target: ContentKind, targetId: string): string =>
    catalogues
      .find((catalogue) => catalogue.kind === target)
      ?.entries.find((entry) => entry.id === targetId)?.name ?? targetId;
  const entry = catalogues
    .find((catalogue) => catalogue.kind === kind)
    ?.entries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    return null;
  }
  const link = (reference: Reference): ContentLink => ({
    ...reference,
    name: nameOf(reference.kind, reference.id),
  });
  const usedBy: ContentLink[] = [];
  for (const catalogue of catalogues) {
    for (const other of catalogue.entries) {
      for (const reference of outgoing(content, catalogue.kind, other.id)) {
        const duplicate = usedBy.some(
          (known) =>
            known.kind === catalogue.kind && known.id === other.id && known.role === reference.role,
        );
        if (reference.kind === kind && reference.id === id && !duplicate) {
          usedBy.push({
            kind: catalogue.kind,
            id: other.id,
            name: other.name,
            role: reference.role,
          });
        }
      }
    }
  }
  return {
    kind,
    id,
    name: entry.name,
    unlockTier: unlockTierOf(entry.record),
    fields: entry.record,
    links: outgoing(content, kind, id).map(link),
    usedBy,
  };
}
