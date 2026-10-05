import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getTotal } from "../inventory/inventoryQueries";
import { positionComponent } from "../map/positionComponent";
import { buildSiteComponent } from "./buildSiteComponent";
import { ConstructionError, ConstructionErrorKind } from "./ConstructionError";
import { SiteKind } from "./constructionTypes";
import type { BuildSiteData, SiteMaterial } from "./constructionTypes";

/**
 * A build site entity with its data.
 */
export type SiteRef = {
  entity: Entity;
  data: BuildSiteData;
};

/**
 * All live build sites (construction and deconstruction jobs) ascending by entity id. Sites that
 * are flagged for deletion are left out.
 *
 * @param engine - The engine.
 * @returns The sites.
 */
export function listSites(engine: GameEngine): SiteRef[] {
  const sites: SiteRef[] = [];
  for (const entity of engine.store.entities()) {
    const data = getComponent(entity, buildSiteComponent);
    if (data !== undefined && !engine.store.isPendingDelete(entity.id)) {
      sites.push({ entity, data });
    }
  }
  return sites;
}

/**
 * Finds one build site.
 *
 * @param engine - The engine.
 * @param jobId - The id of the site entity (the job id).
 * @returns The site, or null when no live site has that id.
 */
export function findSite(engine: GameEngine, jobId: EntityId): SiteRef | null {
  const entity = engine.store.get(jobId);
  const data = entity === undefined ? undefined : getComponent(entity, buildSiteComponent);
  return entity === undefined || data === undefined || engine.store.isPendingDelete(jobId)
    ? null
    : { entity, data };
}

/**
 * Finds one build site or throws `UnknownJob`.
 *
 * @param engine - The engine.
 * @param jobId - The id of the site entity.
 * @returns The site.
 */
export function requireSite(engine: GameEngine, jobId: EntityId): SiteRef {
  const site = findSite(engine, jobId);
  if (site === null) {
    throw new ConstructionError(
      ConstructionErrorKind.UnknownJob,
      `construction job ${jobId} does not exist`,
    );
  }
  return site;
}

/**
 * The build site on a cell, if any.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns The site, or null.
 */
export function siteAt(engine: GameEngine, mapId: number, cellIndex: number): SiteRef | null {
  for (const id of engine.maps.occupants.occupantsOf(mapId, cellIndex)) {
    const site = findSite(engine, id);
    if (site !== null) {
      return site;
    }
  }
  return null;
}

/**
 * The deconstruction site that targets an entity, if any.
 *
 * @param engine - The engine.
 * @param targetId - The entity to be taken down.
 * @returns The site, or null.
 */
export function siteTargeting(engine: GameEngine, targetId: EntityId): SiteRef | null {
  return (
    listSites(engine).find(
      (site) => site.data.kind === SiteKind.Deconstruct && site.data.targetEntityId === targetId,
    ) ?? null
  );
}

/**
 * How much of each required material is already on the site.
 *
 * @param site - The site.
 * @returns One entry per required material with the delivered quantity (capped at the need).
 */
export function deliveredOf(site: SiteRef): SiteMaterial[] {
  return site.data.required.map((item) => ({
    materialId: item.materialId,
    quantity: Math.min(item.quantity, getTotal(site.entity, item.materialId)),
  }));
}

/**
 * What the site still lacks, in the order of the requirement list.
 *
 * @param site - The site.
 * @returns The missing quantities; empty when everything is delivered (always for a
 *   deconstruction).
 */
export function missingMaterials(site: SiteRef): SiteMaterial[] {
  const missing: SiteMaterial[] = [];
  for (const item of site.data.required) {
    const short = item.quantity - getTotal(site.entity, item.materialId);
    if (short > 0) {
      missing.push({ materialId: item.materialId, quantity: short });
    }
  }
  return missing;
}

/**
 * The cell of a site.
 *
 * @param site - The site.
 * @returns Map id and cell index, or null when the entity has no position.
 */
export function siteCell(site: SiteRef): { mapId: number; cellIndex: number } | null {
  const place = getComponent(site.entity, positionComponent);
  return place === undefined ? null : { mapId: place.mapId, cellIndex: place.cellIndex };
}

/**
 * The cell a builder walks to for a site: the site's own cell, or, when that cell is not
 * traversable (a wall that is being taken down), its first traversable neighbour (lowest cell
 * index). The builder works from there.
 *
 * @param engine - The engine.
 * @param site - The site.
 * @returns Map id and cell index, or null when the entity has no position.
 */
export function siteWorkCell(
  engine: GameEngine,
  site: SiteRef,
): { mapId: number; cellIndex: number } | null {
  const cell = siteCell(site);
  const map = cell === null ? undefined : engine.maps.get(cell.mapId);
  if (cell === null || map === undefined || map.isTraversable(cell.cellIndex)) {
    return cell;
  }
  const neighbour = map.neighbors(cell.cellIndex).find((candidate) => map.isTraversable(candidate));
  return { mapId: cell.mapId, cellIndex: neighbour ?? cell.cellIndex };
}
