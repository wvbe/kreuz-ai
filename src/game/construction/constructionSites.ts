import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { governmentFactionId } from "../factions/factionRegistry";
import { findPosting } from "../jobs/jobBoards";
import { cancelPosting } from "../jobs/jobPostings";
import { positionComponent } from "../map/positionComponent";
import { furnitureComponent } from "../storage/furnitureComponent";
import { buildSitePrototypeId } from "../storage/storageTypes";
import { playerCancelToken } from "../task/TaskSystem";
import type { CancelToken } from "../task/taskTypes";
import { buildSiteComponent } from "./buildSiteComponent";
import { requireSite, siteCell, siteTargeting } from "./buildSiteQueries";
import type { SiteRef } from "./buildSiteQueries";
import { ConstructionError, ConstructionErrorKind } from "./ConstructionError";
import { findBuildDefinition, requiredMaterials } from "./constructionDefinitions";
import { getConstructionService } from "./constructionServiceRegistry";
import {
  constructionCancelledReason,
  constructionPausedReason,
  defaultSitePriority,
  doorPrototypeId,
  jobCancelledEvent,
  jobQueuedEvent,
  maxSitePriority,
  SiteKind,
  SiteStatus,
  wallPrototypeId,
} from "./constructionTypes";
import type { JobCancelled, JobQueued } from "./constructionTypes";
import { assertPlacementValid, validatePlacement } from "./placement";
import { refundSite } from "./siteRefund";

/**
 * What the player gives to {@link queueConstruction}.
 */
export type QueueRequest = {
  prototypeId: string;
  mapId: number;
  cellIndex: number;
  priority?: number;
  urgent?: boolean;
};

function clampPriority(priority: number | undefined): number {
  return Math.min(maxSitePriority, Math.max(0, priority ?? defaultSitePriority));
}

function spawnSite(
  engine: GameEngine,
  kind: SiteKind,
  prototypeId: string,
  mapId: number,
  cellIndex: number,
  options: { priority?: number; urgent?: boolean; targetEntityId?: EntityId },
): SiteRef {
  const definition = findBuildDefinition(engine, prototypeId);
  if (definition === undefined) {
    throw new ConstructionError(
      ConstructionErrorKind.UnknownPrototype,
      `"${prototypeId}" cannot be built`,
    );
  }
  const required = kind === SiteKind.Construct ? requiredMaterials(definition) : [];
  const entity = engine.store.spawn(buildSitePrototypeId, {
    Position: { mapId, cellIndex },
    BuildSite: {
      kind,
      prototypeId,
      status: required.length === 0 ? SiteStatus.Building : SiteStatus.Planned,
      required,
      priority: clampPriority(options.priority),
      urgent: options.urgent ?? false,
      targetEntityId: options.targetEntityId ?? null,
      ownerFactionId: governmentFactionId(engine),
      createdTick: engine.time.tickCount,
    },
  });
  // A deconstruction site stands on the wall it takes down, which obstructs its cell.
  engine.maps.occupants.add(entity.id, { mapId, cellIndex });
  const data = getComponent(entity, buildSiteComponent);
  if (data === undefined) {
    throw new Error("the build_site prototype has no BuildSite component");
  }
  const payload: JobQueued = {
    jobId: entity.id,
    kind,
    prototypeId,
    targetEntityId: options.targetEntityId ?? null,
    mapId,
    cellIndex,
  };
  engine.bus.emit(jobQueuedEvent, payload);
  return { entity, data };
}

/**
 * Places a blueprint (spec 016 FR-016, DECISIONS section 3.3 `QueueConstruction`): validates the
 * placement (see `validatePlacement`), spawns a `build_site` entity on the cell with the
 * materials of the build definition and queues `construction.job.queued`. The poster then asks
 * for the materials and the builder. Blueprints have no effect on zones until they are finished.
 *
 * @param engine - The engine.
 * @param request - Definition id, cell and optional priority (`0..100`, default 50) and urgency.
 * @returns The new site; its entity id is the job id.
 */
export function queueConstruction(engine: GameEngine, request: QueueRequest): SiteRef {
  assertPlacementValid(
    validatePlacement(engine, request.prototypeId, request.mapId, request.cellIndex),
  );
  return spawnSite(
    engine,
    SiteKind.Construct,
    request.prototypeId,
    request.mapId,
    request.cellIndex,
    request,
  );
}

/**
 * Places blueprints for walls or doors on many cells (`QueueWalls`, a drag over tiles or a
 * rectangle the renderer expanded). All or nothing: every cell is validated first (a cell listed
 * twice counts as occupied), then one job per cell is queued in the order given.
 *
 * @param engine - The engine.
 * @param prototypeId - `wall` or `door`.
 * @param mapId - Map id.
 * @param cells - Cell indexes.
 * @param priority - Optional priority `0..100`.
 * @returns The new sites in the order of the cells.
 */
export function queueWalls(
  engine: GameEngine,
  prototypeId: string,
  mapId: number,
  cells: readonly number[],
  priority?: number,
): SiteRef[] {
  if (prototypeId !== wallPrototypeId && prototypeId !== doorPrototypeId) {
    throw new ConstructionError(
      ConstructionErrorKind.UnknownPrototype,
      `"${prototypeId}" is neither a wall nor a door`,
    );
  }
  const seen = new Set<number>();
  for (const cell of cells) {
    assertPlacementValid(validatePlacement(engine, prototypeId, mapId, cell));
    if (seen.has(cell)) {
      throw new ConstructionError(
        ConstructionErrorKind.LocationAlreadyOccupied,
        `cell ${cell} is listed twice`,
      );
    }
    seen.add(cell);
  }
  return cells.map((cell) =>
    spawnSite(engine, SiteKind.Construct, prototypeId, mapId, cell, { priority }),
  );
}

/**
 * The build definition id of an existing building: the furniture id of a piece of furniture, or
 * `wall` / `door`.
 *
 * @param entity - Any entity.
 * @returns The definition id, or null when the entity is no building.
 */
export function buildingIdOf(entity: Entity): string | null {
  const furniture = getComponent(entity, furnitureComponent);
  if (furniture !== undefined) {
    return furniture.furnitureId;
  }
  return entity.prototype === wallPrototypeId || entity.prototype === doorPrototypeId
    ? entity.prototype
    : null;
}

/**
 * Orders an existing building taken down (`QueueDeconstruction`): a site of the kind
 * `Deconstruct` appears on the building's cell and needs no materials; when a builder finishes it
 * the building is deleted and its `deconstructionYield` is dropped as a loose pile.
 *
 * @param engine - The engine.
 * @param targetEntityId - The furniture, wall or door to remove.
 * @param priority - Optional priority `0..100`.
 * @returns The new site.
 */
export function queueDeconstruction(
  engine: GameEngine,
  targetEntityId: EntityId,
  priority?: number,
): SiteRef {
  const target = engine.store.get(targetEntityId);
  if (target === undefined || engine.store.isPendingDelete(targetEntityId)) {
    throw new ConstructionError(
      ConstructionErrorKind.UnknownEntity,
      `entity ${targetEntityId} does not exist`,
    );
  }
  const buildingId = buildingIdOf(target);
  const place = getComponent(target, positionComponent);
  const definition = buildingId === null ? undefined : findBuildDefinition(engine, buildingId);
  if (buildingId === null || place === undefined || definition === undefined) {
    throw new ConstructionError(
      ConstructionErrorKind.NotRemovable,
      `entity ${targetEntityId} is no building`,
    );
  }
  if (!definition.removable) {
    throw new ConstructionError(
      ConstructionErrorKind.NotRemovable,
      `${buildingId} cannot be taken down`,
    );
  }
  if (siteTargeting(engine, targetEntityId) !== null) {
    throw new ConstructionError(
      ConstructionErrorKind.LocationAlreadyOccupied,
      `entity ${targetEntityId} is already being taken down`,
    );
  }
  return spawnSite(engine, SiteKind.Deconstruct, buildingId, place.mapId, place.cellIndex, {
    priority,
    targetEntityId,
  });
}

/**
 * Cancels the task of the entity that works on a posting (the executor's cancel hook gives back
 * what the task holds and the claim goes back to the board).
 *
 * @param engine - The engine.
 * @param entityId - The claimant.
 * @param jobTypeId - Task type (the job type id).
 * @param postingId - The posting.
 * @param token - Why it is cancelled (default: the player).
 * @returns True when a matching task was found and cancelled.
 */
export function cancelJobTask(
  engine: GameEngine,
  entityId: EntityId,
  jobTypeId: string,
  postingId: number,
  token: CancelToken = playerCancelToken,
): boolean {
  const task = engine.tasks
    .getQueue(entityId)
    ?.tasks.find(
      (candidate) =>
        candidate.type === jobTypeId &&
        typeof candidate.data === "object" &&
        candidate.data !== null &&
        !Array.isArray(candidate.data) &&
        candidate.data["postingId"] === postingId,
    );
  if (task === undefined) {
    return false;
  }
  engine.tasks.cancel(entityId, task.id, token);
  return true;
}

/**
 * Takes the site's posting off the board: a claimant's task is cancelled first (its supplier
 * gives the carried goods back, a builder leaves), then the posting is cancelled with the reason.
 * The site forgets posting, supplier and builder.
 *
 * @param engine - The engine.
 * @param site - The site.
 * @param reason - Cancel reason of the posting.
 * @param token - Why the task is cancelled (default: the player).
 */
export function withdrawSiteWork(
  engine: GameEngine,
  site: SiteRef,
  reason: string,
  token: CancelToken = playerCancelToken,
): void {
  const found = site.data.postingId === null ? null : findPosting(engine, site.data.postingId);
  if (found !== null) {
    if (found.posting.claimantId !== null) {
      cancelJobTask(
        engine,
        found.posting.claimantId,
        found.posting.jobTypeId,
        found.posting.id,
        token,
      );
    }
    if (findPosting(engine, found.posting.id) !== null) {
      cancelPosting(engine, found.posting.id, reason, engine.time.tickCount);
    }
  }
  site.data.postingId = null;
  site.data.supplierId = null;
  site.data.builderId = null;
  site.data.startedTick = null;
  site.data.progress = 0;
  site.data.durationTicks = 0;
}

/**
 * Cancels a construction or deconstruction job at any stage (spec 016 FR-014, DECISIONS D-27,
 * `CancelConstructionJob`): the posting is withdrawn, a builder stops (nothing is placed), a
 * supplier on the way gives back what it carries as a loose pile, the staged materials go to the
 * nearest storage (else a loose pile) and the site entity is deleted, freeing the cell.
 * `construction.job.cancelled` is queued.
 *
 * @param engine - The engine.
 * @param jobId - The site's entity id.
 * @param reason - Reason for the event (default `construction_cancelled`).
 * @returns The goods that were given back.
 */
export function cancelSite(
  engine: GameEngine,
  jobId: EntityId,
  reason: string = constructionCancelledReason,
): { materialId: string; quantity: number }[] {
  const site = requireSite(engine, jobId);
  withdrawSiteWork(engine, site, reason);
  const refunded = refundSite(engine, site.entity);
  const cell = siteCell(site);
  getConstructionService(engine).remember({
    jobId,
    kind: site.data.kind,
    prototypeId: site.data.prototypeId,
    status: SiteStatus.Cancelled,
    mapId: cell?.mapId ?? 0,
    cellIndex: cell?.cellIndex ?? 0,
    finishedTick: engine.time.tickCount,
  });
  const payload: JobCancelled = { jobId, reason };
  engine.bus.emit(jobCancelledEvent, payload);
  engine.store.requestDelete(jobId);
  return refunded;
}

/**
 * Pauses or resumes a job (`SetConstructionJobPaused`): a paused job has no posting (an open one
 * is withdrawn, a claimed one finishes its attempt) and the poster skips it.
 *
 * @param engine - The engine.
 * @param jobId - The site's entity id.
 * @param paused - The new flag.
 * @returns The site.
 */
export function setSitePaused(engine: GameEngine, jobId: EntityId, paused: boolean): SiteRef {
  const site = requireSite(engine, jobId);
  site.data.paused = paused;
  const found = site.data.postingId === null ? null : findPosting(engine, site.data.postingId);
  if (paused && found !== null && found.posting.claimantId === null) {
    withdrawSiteWork(engine, site, constructionPausedReason);
  }
  return site;
}

/**
 * Sets the priority and urgency of a job (`SetConstructionPriority`); an existing posting follows
 * at once, so the claim order (DECISIONS D-08) reflects it.
 *
 * @param engine - The engine.
 * @param jobId - The site's entity id.
 * @param priority - New priority, clamped to `0..100`.
 * @param urgent - New urgency; unchanged when omitted.
 * @returns The site.
 */
export function setSitePriority(
  engine: GameEngine,
  jobId: EntityId,
  priority: number,
  urgent?: boolean,
): SiteRef {
  const site = requireSite(engine, jobId);
  site.data.priority = clampPriority(priority);
  if (urgent !== undefined) {
    site.data.urgent = urgent;
  }
  const found = site.data.postingId === null ? null : findPosting(engine, site.data.postingId);
  if (found !== null) {
    found.posting.priority = site.data.priority;
    found.posting.urgent = site.data.urgent;
  }
  return site;
}

/**
 * Moves a job to the front of the queue (`MoveConstructionJobToFront`): top priority and urgent,
 * so it is claimed before everything that is not equally top (ties go to the older posting).
 *
 * @param engine - The engine.
 * @param jobId - The site's entity id.
 * @returns The site.
 */
export function moveSiteToFront(engine: GameEngine, jobId: EntityId): SiteRef {
  return setSitePriority(engine, jobId, maxSitePriority, true);
}
