import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { getTotal } from "../inventory/inventoryQueries";
import { findPosting } from "../jobs/jobBoards";
import { postJob } from "../jobs/jobPostings";
import { PostingStatus } from "../jobs/jobTypes";
import { nearestRunningBoard } from "../storage/haulPoster";
import { findSources } from "../storage/storageQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { listSites, missingMaterials, siteCell, siteWorkCell } from "./buildSiteQueries";
import type { SiteRef } from "./buildSiteQueries";
import { siteBlockers } from "./siteBlockers";
import { cancelSite } from "./constructionSites";
import { getConstructionService } from "./constructionServiceRegistry";
import {
  ConstructionBlockedKind,
  constructionPosterIntervalTicks,
  constructJobId,
  jobResumedEvent,
  jobSuspendedEvent,
  locationLostReason,
  SiteKind,
  SiteStatus,
  supplyJobId,
} from "./constructionTypes";
import type { JobResumed, JobSuspended } from "./constructionTypes";
import { isSiteLost } from "./siteCompletion";

function taskData(
  engine: GameEngine,
  entityId: number,
  jobTypeId: string,
): { [field: string]: JsonValue }[] {
  const found: { [field: string]: JsonValue }[] = [];
  for (const task of engine.tasks.getQueue(entityId)?.tasks ?? []) {
    if (
      task.type === jobTypeId &&
      typeof task.data === "object" &&
      task.data !== null &&
      !Array.isArray(task.data)
    ) {
      found.push(task.data);
    }
  }
  return found;
}

/**
 * Derives the status of a site from its delivered materials (spec 016, DECISIONS D-27): a
 * deconstruction and a construction with everything delivered are `Building`; a construction
 * with something delivered, a supplier on the way or a posting out is `Supplying`; otherwise
 * `Planned`.
 *
 * @param site - The site; its `status` is updated.
 * @returns The new status.
 */
export function refreshSiteStatus(site: SiteRef): SiteStatus {
  if (site.data.kind === SiteKind.Deconstruct || missingMaterials(site).length === 0) {
    site.data.status = SiteStatus.Building;
  } else if (
    site.data.supplierId !== null ||
    site.data.postingId !== null ||
    site.data.required.some((item) => getTotal(site.entity, item.materialId) > 0)
  ) {
    site.data.status = SiteStatus.Supplying;
  } else {
    site.data.status = SiteStatus.Planned;
  }
  return site.data.status;
}

function setBlocked(engine: GameEngine, site: SiteRef, materialId: string | null): void {
  if (site.data.blockedMaterialId === materialId) {
    return;
  }
  site.data.blockedMaterialId = materialId;
  if (materialId === null) {
    const resumed: JobResumed = { jobId: site.entity.id };
    engine.bus.emit(jobResumedEvent, resumed);
    return;
  }
  const reason = siteBlockers(engine, site).find(
    (entry) =>
      entry.kind === ConstructionBlockedKind.MissingInput &&
      entry.params["materialId"] === materialId,
  );
  const suspended: JobSuspended = {
    jobId: site.entity.id,
    reason: reason ?? { kind: ConstructionBlockedKind.MissingInput, params: { materialId } },
  };
  engine.bus.emit(jobSuspendedEvent, suspended);
}

function postSupply(engine: GameEngine, site: SiteRef, boardId: number, tick: number): boolean {
  const place = siteCell(site);
  if (place === null) {
    return false;
  }
  for (const item of missingMaterials(site)) {
    if (findSources(engine, site.entity, item.materialId, item.quantity).length === 0) {
      continue;
    }
    site.data.postingId = postJob(
      engine,
      boardId,
      {
        jobTypeId: supplyJobId,
        target: {
          mapId: place.mapId,
          cellIndex: place.cellIndex,
          entityId: site.entity.id,
          materialId: item.materialId,
        },
        priority: site.data.priority,
        urgent: site.data.urgent,
      },
      tick,
    ).id;
    return true;
  }
  return false;
}

/**
 * Posts the work of the build sites (DECISIONS D-08: system postings go to the nearest running
 * board at once). Every {@link constructionPosterIntervalTicks} ticks, for each site that is not
 * paused and has no posting out, in ascending id order:
 * - a construction that still lacks materials gets one `build.supply` posting for the first
 *   missing material that has a source (claimable storage, loose piles; reserved stock does not
 *   count): one posting per site means one supplier at a time, so deliveries never overshoot the
 *   need; when no missing material has a source the site is suspended
 *   (`construction.job.suspended` with `MissingInput`) and resumes by itself
 *   (`construction.job.resumed`) once a source appears;
 * - a site with every material delivered (and every deconstruction) and nobody working gets one
 *   `build.construct` posting. One posting means one builder per site (FR-012).
 * The posting carries the site's priority and urgency, the usual adult-citizen eligibility and the
 * site's cell as target. A posting that vanished (failed, cancelled by somebody else) is
 * forgotten first.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postSiteJobs(engine: GameEngine, tick: number): number[] {
  if (
    !engine.content.jobs.has(constructJobId) ||
    !engine.content.jobs.has(supplyJobId) ||
    tick % constructionPosterIntervalTicks !== 0
  ) {
    return [];
  }
  const created: number[] = [];
  for (const site of listSites(engine)) {
    if (site.data.postingId !== null && findPosting(engine, site.data.postingId) === null) {
      site.data.postingId = null;
    }
    if (site.data.paused || site.data.postingId !== null) {
      continue;
    }
    const place = siteWorkCell(engine, site);
    const boardId = nearestRunningBoard(engine, site.entity);
    if (place === null || boardId === null) {
      continue;
    }
    const missing = missingMaterials(site);
    if (missing.length > 0) {
      if (site.data.supplierId !== null) {
        continue;
      }
      if (postSupply(engine, site, boardId, tick)) {
        setBlocked(engine, site, null);
        created.push(site.data.postingId ?? 0);
      } else {
        setBlocked(engine, site, missing[0]?.materialId ?? null);
      }
    } else if (site.data.builderId === null) {
      setBlocked(engine, site, null);
      site.data.postingId = postJob(
        engine,
        boardId,
        {
          jobTypeId: constructJobId,
          target: {
            mapId: place.mapId,
            cellIndex: place.cellIndex,
            entityId: site.entity.id,
            materialId: null,
          },
          priority: site.data.priority,
          urgent: site.data.urgent,
        },
        tick,
      ).id;
      created.push(site.data.postingId);
    }
    refreshSiteStatus(site);
  }
  return created;
}

function sweepBuilder(engine: GameEngine, site: SiteRef): void {
  const builderId = site.data.builderId;
  if (builderId === null) {
    return;
  }
  const found = site.data.postingId === null ? null : findPosting(engine, site.data.postingId);
  const lost =
    engine.store.get(builderId) === undefined ||
    found === null ||
    found.posting.status !== PostingStatus.Claimed ||
    found.posting.claimantId !== builderId ||
    !taskData(engine, builderId, constructJobId).some(
      (data) => data["postingId"] === found.posting.id,
    );
  if (lost) {
    site.data.builderId = null;
    site.data.startedTick = null;
    site.data.progress = 0;
    site.data.durationTicks = 0;
  } else if (site.data.startedTick !== null) {
    site.data.progress = Math.min(
      site.data.durationTicks,
      Math.max(0, engine.time.tickCount - site.data.startedTick),
    );
  }
}

function sweepSupplier(engine: GameEngine, site: SiteRef): void {
  const supplierId = site.data.supplierId;
  if (
    supplierId !== null &&
    (engine.store.get(supplierId) === undefined ||
      !taskData(engine, supplierId, supplyJobId).some((data) => data["siteId"] === site.entity.id))
  ) {
    site.data.supplierId = null;
  }
}

/**
 * Keeps the build sites consistent with the workers (runs every tick, slot 8):
 * - a builder that was deleted, lost its claim or its task puts the site back to "nobody works"
 *   (progress 0, FR-011; the delivered materials stay); a working builder's `progress` is
 *   `tick - startedTick`;
 * - a supplier that vanished frees the site's supplier slot;
 * - `Supply` reservations whose holder no longer has a `build.supply` task are released;
 * - the status of every site is re-derived;
 * - every {@link constructionPosterIntervalTicks} ticks sites that can never be finished (the
 *   cell was taken, the target of a deconstruction vanished) are cancelled with `location_lost`
 *   and the finished-job history is pruned.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns How many jobs were cancelled.
 */
export function sweepSites(engine: GameEngine, tick: number): number {
  let cancelled = 0;
  for (const site of listSites(engine)) {
    sweepBuilder(engine, site);
    sweepSupplier(engine, site);
    refreshSiteStatus(site);
  }
  const reservations = getStorageService(engine).reservations;
  for (const reservation of reservations.all()) {
    if (
      reservation.kind === ReservationKind.Supply &&
      !hasTaskOfType(engine, reservation.holderId, supplyJobId)
    ) {
      reservations.release(reservation.id);
    }
  }
  if (tick % constructionPosterIntervalTicks === 0) {
    for (const site of listSites(engine)) {
      if (isSiteLost(engine, site)) {
        cancelSite(engine, site.entity.id, locationLostReason);
        cancelled += 1;
      }
    }
    getConstructionService(engine).prune(tick);
  }
  return cancelled;
}

function hasTaskOfType(engine: GameEngine, entityId: number, jobTypeId: string): boolean {
  return engine.tasks.getQueue(entityId)?.tasks.some((task) => task.type === jobTypeId) ?? false;
}
