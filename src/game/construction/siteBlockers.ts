import type { GameEngine } from "../engine/GameEngine";
import { getTotal } from "../inventory/inventoryQueries";
import { findSources } from "../storage/storageQueries";
import { missingMaterials } from "./buildSiteQueries";
import type { SiteRef } from "./buildSiteQueries";
import { findBuildDefinition, isUnlocked, unlockTierOf } from "./constructionDefinitions";
import { ConstructionBlockedKind } from "./constructionTypes";
import type { ConstructionBlockedReason } from "./constructionTypes";

/**
 * Why a construction job does not progress (spec 016 FR-002 suspended reasons, spec 025 blocked
 * reasons): pure, derived on demand, never text. In the 025 order:
 * - `LockedByTier {unlockTier}`: the settlement fell below the definition's tier;
 * - `Paused {}`: the player paused the job;
 * - `MissingInput {materialId, required, delivered, available}` for every missing material that
 *   no claimable storage can supply while nobody is carrying it (`available` is what storage
 *   could give the site, reserved stock excluded).
 * An empty list means nothing blocks the job (it may still wait for a free worker).
 *
 * @param engine - The engine.
 * @param site - The site.
 * @returns The reasons, empty when nothing blocks it.
 */
export function siteBlockers(engine: GameEngine, site: SiteRef): ConstructionBlockedReason[] {
  const reasons: ConstructionBlockedReason[] = [];
  const definition = findBuildDefinition(engine, site.data.prototypeId);
  if (definition !== undefined && !isUnlocked(engine, definition)) {
    reasons.push({
      kind: ConstructionBlockedKind.LockedByTier,
      params: { unlockTier: unlockTierOf(definition) },
    });
  }
  if (site.data.paused) {
    reasons.push({ kind: ConstructionBlockedKind.Paused, params: {} });
  }
  if (site.data.supplierId === null) {
    for (const item of missingMaterials(site)) {
      const available = findSources(engine, site.entity, item.materialId, item.quantity).reduce(
        (sum, source) => sum + source.quantity,
        0,
      );
      if (available < 1) {
        const required =
          site.data.required.find((entry) => entry.materialId === item.materialId)?.quantity ?? 0;
        reasons.push({
          kind: ConstructionBlockedKind.MissingInput,
          params: {
            materialId: item.materialId,
            required,
            delivered: getTotal(site.entity, item.materialId),
            available,
          },
        });
      }
    }
  }
  return reasons;
}
