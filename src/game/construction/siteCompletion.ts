import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { retrieve } from "../inventory/inventoryOperations";
import { findSite, missingMaterials, siteCell } from "./buildSiteQueries";
import type { SiteRef } from "./buildSiteQueries";
import { builtPrototype, findBuildDefinition } from "./constructionDefinitions";
import { getConstructionService } from "./constructionServiceRegistry";
import { jobCompletedEvent, PlacementReasonKind, SiteKind, SiteStatus } from "./constructionTypes";
import type { JobCompleted, PlacementReason, SiteMaterial } from "./constructionTypes";
import { validatePlacement } from "./placement";
import { dropLoosePile, refundSite } from "./siteRefund";
import { applyWallObstruction, clearWallObstruction } from "./wallObstruction";

/**
 * What stops a construction site from being built now: something occupies the cell or its terrain
 * is no longer buildable (the unlock tier and the site's own blueprint do not count).
 *
 * @param engine - The engine.
 * @param site - The site.
 * @returns The blocking reasons; empty when the site can be finished, or for a deconstruction.
 */
export function placementBlockers(engine: GameEngine, site: SiteRef): PlacementReason[] {
  const cell = siteCell(site);
  if (cell === null || site.data.kind !== SiteKind.Construct) {
    return [];
  }
  return validatePlacement(
    engine,
    site.data.prototypeId,
    cell.mapId,
    cell.cellIndex,
  ).reasons.filter(
    (reason) =>
      reason.kind === PlacementReasonKind.Occupied ||
      reason.kind === PlacementReasonKind.TerrainNotBuildable ||
      (reason.kind === PlacementReasonKind.SiteExists && reason.params["jobId"] !== site.entity.id),
  );
}

/**
 * Whether the work of a site can no longer be finished because its place or target is gone: a
 * construction whose cell was taken, a deconstruction whose target vanished. The poster cancels
 * such jobs with `location_lost` and refunds the materials.
 *
 * @param engine - The engine.
 * @param site - The site.
 * @returns True when the site is lost.
 */
export function isSiteLost(engine: GameEngine, site: SiteRef): boolean {
  if (site.data.kind === SiteKind.Construct) {
    return placementBlockers(engine, site).length > 0;
  }
  const targetId = site.data.targetEntityId;
  const target = targetId === null ? undefined : engine.store.get(targetId);
  return target === undefined || engine.store.isPendingDelete(target.id);
}

function finish(engine: GameEngine, site: SiteRef, payload: JobCompleted): void {
  getConstructionService(engine).remember({
    jobId: site.entity.id,
    kind: site.data.kind,
    prototypeId: site.data.prototypeId,
    status: SiteStatus.Done,
    mapId: payload.mapId,
    cellIndex: payload.cellIndex,
    finishedTick: engine.time.tickCount,
  });
  engine.bus.emit(jobCompletedEvent, payload);
  engine.store.requestDelete(site.entity.id);
}

function completeConstruction(engine: GameEngine, site: SiteRef): boolean {
  const cell = siteCell(site);
  const definition = findBuildDefinition(engine, site.data.prototypeId);
  if (cell === null || definition === undefined || missingMaterials(site).length > 0) {
    return false;
  }
  if (placementBlockers(engine, site).length > 0) {
    return false;
  }
  const context = { materials: engine.materials, actor: null, bus: engine.bus };
  const consumed: SiteMaterial[] = [];
  for (const item of site.data.required) {
    retrieve(context, site.entity, item.materialId, item.quantity);
    consumed.push({ ...item });
  }
  refundSite(engine, site.entity);
  const built = builtPrototype(engine, site.data.prototypeId);
  const entity = engine.store.spawn(built.prototypeId, {
    ...built.overrides,
    Position: { mapId: cell.mapId, cellIndex: cell.cellIndex },
  });
  engine.maps.placeEntity(entity.id, cell.mapId, cell.cellIndex);
  applyWallObstruction(engine, entity);
  finish(engine, site, {
    jobId: site.entity.id,
    kind: SiteKind.Construct,
    prototypeId: site.data.prototypeId,
    mapId: cell.mapId,
    cellIndex: cell.cellIndex,
    consumed,
    yield: [],
    entityId: entity.id,
  });
  return true;
}

function completeDeconstruction(engine: GameEngine, site: SiteRef): boolean {
  const cell = siteCell(site);
  const definition = findBuildDefinition(engine, site.data.prototypeId);
  const targetId = site.data.targetEntityId;
  const target = targetId === null ? undefined : engine.store.get(targetId);
  if (cell === null || definition === undefined) {
    return false;
  }
  if (target === undefined || engine.store.isPendingDelete(target.id)) {
    return false;
  }
  engine.store.requestDelete(target.id);
  // The deletion is flushed at the end of the tick; the cell is free (and the yield can land on
  // it) from now on.
  clearWallObstruction(engine, target);
  const yielded = definition.deconstructionYield.map((item) => ({ ...item }));
  dropLoosePile(engine, cell.mapId, cell.cellIndex, yielded);
  finish(engine, site, {
    jobId: site.entity.id,
    kind: SiteKind.Deconstruct,
    prototypeId: site.data.prototypeId,
    mapId: cell.mapId,
    cellIndex: cell.cellIndex,
    consumed: [],
    yield: yielded,
    entityId: null,
  });
  return true;
}

/**
 * Finishes a build site (spec 016 FR-008/FR-009, DECISIONS D-27): the job is the builder's
 * completed claim.
 * - Construction: the staged materials are consumed (surplus goes back like a cancel's refund),
 *   the real entity is spawned on the cell (a furniture prototype by its id or `furniture_piece`,
 *   a workstation with its `ProductionOrders`, `wall`, `door`), a wall obstructs the cell at once
 *   (paths re-plan through the map revision) and the site is deleted. The zones of slot 9 see
 *   the new piece in the same tick. When the cell was taken meanwhile nothing is built and the
 *   function returns false (the poster cancels such a job, see {@link isSiteLost}).
 * - Deconstruction: the target is deleted (its own delete hooks run: a workstation drops its
 *   contents, a wall frees its cell), the `deconstructionYield` is dropped as a loose pile and the
 *   site is deleted; a vanished target returns false.
 * `construction.job.completed` carries what was consumed and yielded and the entity placed.
 *
 * @param engine - The engine.
 * @param jobId - The site's entity id.
 * @returns True when the job completed; false when the site is gone, incomplete or was cancelled.
 */
export function completeSite(engine: GameEngine, jobId: EntityId): boolean {
  const site = findSite(engine, jobId);
  if (site === null) {
    return false;
  }
  return site.data.kind === SiteKind.Construct
    ? completeConstruction(engine, site)
    : completeDeconstruction(engine, site);
}
