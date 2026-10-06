/**
 * One entry of the `build-menu` query.
 */
export type BuildMenuEntry = {
  id: string;
  name: string;
  tags: readonly string[];
  materials: readonly { materialId: string; quantity: number }[];
  constructionTicks: number;
  unlockTier: string | null;
  locked: boolean;
  unlockText: string | null;
};

/**
 * The groups of the build menu, in display order.
 */
export enum BuildCategory {
  Structure = "Structure",
  Workstations = "Workstations",
  Storage = "Storage",
  Comfort = "Comfort and beds",
  Religion = "Religion",
  Utility = "Utility",
  Other = "Other",
}

const categoryOrder: readonly BuildCategory[] = [
  BuildCategory.Structure,
  BuildCategory.Workstations,
  BuildCategory.Storage,
  BuildCategory.Comfort,
  BuildCategory.Religion,
  BuildCategory.Utility,
  BuildCategory.Other,
];

/**
 * The group an entry belongs to, read from its tags (the build menu carries tags, not a category
 * field).
 *
 * @param tags - Tags of the menu entry.
 * @returns The category.
 */
export function categoryOf(tags: readonly string[]): BuildCategory {
  const has = (tag: string) => tags.includes(tag);
  if (has("wall") || has("structure")) {
    return BuildCategory.Structure;
  }
  if (has("workstation")) {
    return BuildCategory.Workstations;
  }
  if (has("storage")) {
    return BuildCategory.Storage;
  }
  if (has("religious")) {
    return BuildCategory.Religion;
  }
  if (has("bed") || has("comfort") || has("seating") || has("table") || has("governance")) {
    return BuildCategory.Comfort;
  }
  if (has("utility") || has("water") || has("warmth")) {
    return BuildCategory.Utility;
  }
  return BuildCategory.Other;
}

/**
 * A group of the menu with the entries that passed the filter.
 */
export type BuildGroup = {
  category: BuildCategory;
  entries: readonly BuildMenuEntry[];
};

/**
 * Groups the menu by category and filters it by a search text (name, id or tag, case-insensitive).
 * Unlocked entries come before locked ones inside a group; empty groups are dropped.
 *
 * @param entries - The `build-menu` view.
 * @param search - The search text; empty keeps everything.
 * @returns The groups in display order.
 */
export function groupBuildMenu(
  entries: readonly BuildMenuEntry[],
  search: string,
): readonly BuildGroup[] {
  const needle = search.trim().toLowerCase();
  const kept = entries.filter(
    (entry) =>
      needle === "" ||
      entry.name.toLowerCase().includes(needle) ||
      entry.id.toLowerCase().includes(needle) ||
      entry.tags.some((tag) => tag.toLowerCase().includes(needle)),
  );
  return categoryOrder
    .map((category) => ({
      category,
      entries: kept
        .filter((entry) => categoryOf(entry.tags) === category)
        .sort((left, right) => Number(left.locked) - Number(right.locked)),
    }))
    .filter((group) => group.entries.length > 0);
}

/**
 * The badge text of a locked entry.
 *
 * @param entry - A menu entry.
 * @returns "Unlocks at <Tier>", or null for an unlocked entry.
 */
export function lockBadge(entry: BuildMenuEntry): string | null {
  if (!entry.locked) {
    return null;
  }
  return entry.unlockText ?? `Unlocks at ${entry.unlockTier ?? "a later tier"}`;
}

/**
 * Whether the wall tool (a dragged rectangle) places this entry; everything else is one click.
 *
 * @param id - The build definition id.
 * @returns True for `wall`.
 */
export function usesWallTool(id: string): boolean {
  return id === "wall";
}
