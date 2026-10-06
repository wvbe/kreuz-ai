import { ContentFile } from "./contentTypes";
import { bundledContentFiles, loadContentPack } from "./ContentLoader";
import type { ContentRegistries } from "./ContentRegistries";
import { SettlementTier } from "./contentTypes";

const lockedIds: readonly [ContentFile, string][] = [
  [ContentFile.Furniture, "oven"],
  [ContentFile.Zones, "bakery"],
  [ContentFile.Recipes, "bake_bread"],
];

/**
 * The bundled pack with the bakery chain (oven, bakery zone, `bake_bread`) locked at Village, as
 * it was before DECISIONS D-54 moved it to Hamlet. Test support: the bundled pack has no other
 * locked furniture, zone or recipe, so tests of the tier gates (`ContentLocked`, `LockedByTier`,
 * "Unlocks at Village") use this pack as their sample of locked content.
 *
 * @returns Fresh registries of the modified pack.
 */
export function loadVillageBakeryContent(): ContentRegistries {
  const files = { ...bundledContentFiles };
  for (const [file, id] of lockedIds) {
    const records = files[file];
    if (!Array.isArray(records)) {
      throw new Error(`content file ${file} is not a list`);
    }
    files[file] = records.map((record) =>
      typeof record === "object" && record !== null && !Array.isArray(record) && record["id"] === id
        ? { ...record, unlockTier: SettlementTier.Village }
        : record,
    );
  }
  return loadContentPack(files);
}
