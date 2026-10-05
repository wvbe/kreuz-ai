import { getComponent, hasComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { buildSiteComponent } from "../construction/buildSiteComponent";
import { citizenComponent } from "../factions/citizenComponent";
import { jobBoardComponent } from "../jobs/jobBoardComponent";
import { productionOrdersComponent } from "../production/productionOrdersComponent";
import { isLoosePile } from "../storage/storageQueries";
import { zoneComponent } from "../zones/zoneComponent";
import { StatusSubjectKind } from "./statusTypes";
import type { StatusSubjectRef } from "./statusTypes";

/**
 * The status subject an entity is, judged by its components: a citizen, workstation, build site,
 * zone, job board or loose pile. Used by `why <entityId>` and by flow attribution.
 *
 * @param engine - The engine.
 * @param entityId - Any entity id.
 * @returns The subject ref, or null when the entity is none of them (or does not exist).
 */
export function subjectOfEntity(engine: GameEngine, entityId: EntityId): StatusSubjectRef | null {
  const entity = engine.store.get(entityId);
  if (entity === undefined || engine.store.isPendingDelete(entityId)) {
    return null;
  }
  const kind = hasComponent(entity, citizenComponent)
    ? StatusSubjectKind.Citizen
    : getComponent(entity, productionOrdersComponent) !== undefined
      ? StatusSubjectKind.Workstation
      : getComponent(entity, buildSiteComponent) !== undefined
        ? StatusSubjectKind.ConstructionSite
        : getComponent(entity, zoneComponent) !== undefined
          ? StatusSubjectKind.Zone
          : getComponent(entity, jobBoardComponent) !== undefined
            ? StatusSubjectKind.JobBoard
            : isLoosePile(entity)
              ? StatusSubjectKind.LoosePile
              : null;
  return kind === null ? null : { kind, id: entityId };
}
