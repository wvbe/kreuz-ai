import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { deliveredOf, findSite, listSites, siteCell } from "./buildSiteQueries";
import type { SiteRef } from "./buildSiteQueries";
import { siteBlockers } from "./siteBlockers";
import { isUnlocked, unlockText, unlockTierOf } from "./constructionDefinitions";
import { getConstructionService } from "./constructionServiceRegistry";
import type {
  ConstructionBlockedReason,
  RecentJob,
  SiteKind,
  SiteMaterial,
  SiteStatus,
} from "./constructionTypes";

/**
 * One live build site as the renderer and the CLI see it.
 */
export type SiteView = {
  jobId: EntityId;
  kind: SiteKind;
  prototypeId: string;
  status: SiteStatus;
  mapId: number;
  cellIndex: number;
  required: SiteMaterial[];
  delivered: SiteMaterial[];
  progress: number;
  durationTicks: number;
  builderId: EntityId | null;
  supplierId: EntityId | null;
  priority: number;
  urgent: boolean;
  paused: boolean;
  targetEntityId: EntityId | null;
  blockers: ConstructionBlockedReason[];
};

/**
 * The construction queue: live jobs in claim order (priority desc, urgent first, id asc) and the
 * jobs that finished in the last day.
 */
export type ConstructionQueueView = {
  jobs: SiteView[];
  recent: RecentJob[];
};

/**
 * One entry of the build menu.
 */
export type BuildOptionView = {
  id: string;
  name: string;
  tags: string[];
  materials: SiteMaterial[];
  constructionTicks: number;
  unlockTier: string;
  locked: boolean;
  /**
   * `Unlocks at <Tier>` when locked, else null.
   */
  unlockText: string | null;
};

function buildSiteView(engine: GameEngine, site: SiteRef): SiteView {
  const cell = siteCell(site);
  return {
    jobId: site.entity.id,
    kind: site.data.kind,
    prototypeId: site.data.prototypeId,
    status: site.data.status,
    mapId: cell?.mapId ?? 0,
    cellIndex: cell?.cellIndex ?? 0,
    required: site.data.required.map((item) => ({ ...item })),
    delivered: deliveredOf(site),
    progress: site.data.progress,
    durationTicks: site.data.durationTicks,
    builderId: site.data.builderId,
    supplierId: site.data.supplierId,
    priority: site.data.priority,
    urgent: site.data.urgent,
    paused: site.data.paused,
    targetEntityId: site.data.targetEntityId,
    blockers: siteBlockers(engine, site),
  };
}

/**
 * The view of one job (query `site {jobId}`).
 *
 * @param engine - The engine.
 * @param jobId - The site's entity id.
 * @returns The view, or null when the job does not exist (any more).
 */
export function buildSiteDetail(engine: GameEngine, jobId: EntityId): SiteView | null {
  const site = findSite(engine, jobId);
  return site === null ? null : buildSiteView(engine, site);
}

/**
 * The construction queue (query `construction-queue`, spec 016 `ConstructionQueue`).
 *
 * @param engine - The engine.
 * @param mapId - Only jobs on this map, or all maps when omitted.
 * @returns Live jobs in claim order and the recently finished ones.
 */
export function buildQueueView(engine: GameEngine, mapId?: number): ConstructionQueueView {
  const jobs = listSites(engine)
    .map((site) => buildSiteView(engine, site))
    .filter((view) => mapId === undefined || view.mapId === mapId)
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        Number(right.urgent) - Number(left.urgent) ||
        left.jobId - right.jobId,
    );
  return {
    jobs,
    recent: getConstructionService(engine)
      .recent()
      .filter((job) => mapId === undefined || job.mapId === mapId),
  };
}

/**
 * The build menu (query `build-menu`, spec 024 FR-013): every build definition with its
 * materials, work ticks and lock state; locked entries carry `Unlocks at <Tier>`.
 *
 * @param engine - The engine.
 * @returns One entry per definition, in content order.
 */
export function buildMenuView(engine: GameEngine): BuildOptionView[] {
  return engine.content.furniture.all().map((definition) => {
    const locked = !isUnlocked(engine, definition);
    return {
      id: definition.id,
      name: definition.name,
      tags: [...definition.tags],
      materials: definition.constructionMaterials.map((item) => ({ ...item })),
      constructionTicks: definition.constructionTicks,
      unlockTier: unlockTierOf(definition),
      locked,
      unlockText: locked ? unlockText(unlockTierOf(definition)) : null,
    };
  });
}
