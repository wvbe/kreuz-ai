import { cellVerbs } from "./cellVerbs";
import { constructionVerbs } from "./constructionVerbs";
import { crierVerbs } from "./crierVerbs";
import { diplomacyVerbs } from "./diplomacyVerbs";
import { gatheringVerbs } from "./gatheringVerbs";
import { inspectVerbs } from "./inspectVerbs";
import { jobVerbs } from "./jobVerbs";
import { kernelVerbs } from "./kernelVerbs";
import { metaVerbs } from "./metaVerbs";
import { productionVerbs } from "./productionVerbs";
import { housingVerbs } from "./housingVerbs";
import { settlementVerbs } from "./settlementVerbs";
import { statusVerbs } from "./statusVerbs";
import { storageVerbs } from "./storageVerbs";
import { tradeVerbs } from "./tradeVerbs";
import { zoneVerbs } from "./zoneVerbs";
import type { Verb } from "./Verb";

/**
 * Every verb group, in the order `help` lists them. A later phase adds its verbs by creating one
 * `verbs/<group>Verbs.ts` file exporting a `readonly Verb[]` and adding that array here.
 */
export const verbGroups: readonly (readonly Verb[])[] = [
  kernelVerbs,
  inspectVerbs,
  cellVerbs,
  jobVerbs,
  crierVerbs,
  storageVerbs,
  zoneVerbs,
  productionVerbs,
  constructionVerbs,
  gatheringVerbs,
  tradeVerbs,
  diplomacyVerbs,
  settlementVerbs,
  housingVerbs,
  statusVerbs,
  metaVerbs,
];

/**
 * Flattens the verb groups.
 *
 * @param groups - Verb groups (default: all registered groups).
 * @returns All verbs; a duplicate name is a programming error and throws.
 */
export function createVerbRegistry(groups: readonly (readonly Verb[])[] = verbGroups): Verb[] {
  const verbs = groups.flat();
  const seen = new Set<string>();
  for (const verb of verbs) {
    if (seen.has(verb.name)) {
      throw new Error(`duplicate CLI verb "${verb.name}"`);
    }
    seen.add(verb.name);
  }
  return verbs;
}
