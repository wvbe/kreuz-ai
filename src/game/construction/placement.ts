import { getComponent, hasComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { furnitureComponent } from "../storage/furnitureComponent";
import { buildSitePrototypeId } from "../storage/storageTypes";
import { jobBoardPrototypeId } from "../zones/zoneTypes";
import { zoneAt } from "../zones/zoneQueries";
import { buildSiteComponent } from "./buildSiteComponent";
import {
  findBuildDefinition,
  isUnlocked,
  unlockText,
  unlockTierOf,
} from "./constructionDefinitions";
import { ConstructionError, ConstructionErrorKind } from "./ConstructionError";
import { doorPrototypeId, PlacementReasonKind, wallPrototypeId } from "./constructionTypes";
import type { PlacementReason, PlacementResult } from "./constructionTypes";

function result(
  prototypeId: string,
  mapId: number,
  cellIndex: number,
  reasons: PlacementReason[],
  unlockTier: string | null,
  zoneId: number | null,
): PlacementResult {
  return {
    valid: reasons.length === 0,
    prototypeId,
    mapId,
    cellIndex,
    reasons,
    zoneId,
    unlockTier,
  };
}

/**
 * Checks whether a building may be placed on a cell (spec 016 FR-016/FR-017, spec 024 FR-014; the
 * query behind the blueprint ghost). It reads the world and changes nothing. The hard constraints
 * and their reason codes:
 * - `UnknownMap`, `OutOfBounds`: no such map or cell (nothing else is checked then);
 * - `UnknownPrototype`: the pack has no build definition with that id;
 * - `TierLocked`: the settlement has not reached the unlock tier (text `Unlocks at <Tier>`);
 * - `TerrainNotBuildable`: the terrain of the cell is not buildable (water, forest, rock);
 * - `SiteExists`: another blueprint already holds the cell (also a pending deconstruction);
 * - `Occupied`: a furniture piece, wall, door or job board stands on the cell.
 *
 * Citizens and creatures never block a build (spec 004). Zone membership is no constraint
 * either (spec 024 edge case): `zoneId` reports the zone under the cell so the renderer can warn.
 * Entities flagged for deletion do not block.
 *
 * @param engine - The engine.
 * @param prototypeId - Furniture, wall or door id.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns Validity, every reason found, the zone of the cell and the unlock tier.
 */
export function validatePlacement(
  engine: GameEngine,
  prototypeId: string,
  mapId: number,
  cellIndex: number,
): PlacementResult {
  const definition = findBuildDefinition(engine, prototypeId);
  const unlockTier = definition === undefined ? null : unlockTierOf(definition);
  const map = engine.maps.get(mapId);
  if (map === undefined) {
    return result(
      prototypeId,
      mapId,
      cellIndex,
      [
        {
          kind: PlacementReasonKind.UnknownMap,
          text: `map ${mapId} does not exist`,
          params: { mapId },
        },
      ],
      unlockTier,
      null,
    );
  }
  if (!map.inBounds(cellIndex)) {
    return result(
      prototypeId,
      mapId,
      cellIndex,
      [
        {
          kind: PlacementReasonKind.OutOfBounds,
          text: `cell ${cellIndex} is not on map ${mapId}`,
          params: { mapId, cellIndex },
        },
      ],
      unlockTier,
      null,
    );
  }
  const reasons: PlacementReason[] = [];
  if (definition === undefined) {
    reasons.push({
      kind: PlacementReasonKind.UnknownPrototype,
      text: `"${prototypeId}" cannot be built`,
      params: { prototypeId },
    });
  } else if (!isUnlocked(engine, definition)) {
    reasons.push({
      kind: PlacementReasonKind.TierLocked,
      text: unlockText(unlockTierOf(definition)),
      params: { unlockTier: unlockTierOf(definition) },
    });
  }
  const terrainId = map.terrainAt(cellIndex);
  if (engine.content.terrainContent.find(terrainId)?.buildable !== true) {
    reasons.push({
      kind: PlacementReasonKind.TerrainNotBuildable,
      text: `${terrainId} cannot be built on`,
      params: { terrainId },
    });
  }
  for (const id of engine.maps.occupants.occupantsOf(mapId, cellIndex)) {
    const entity = engine.store.get(id);
    if (entity === undefined || engine.store.isPendingDelete(id)) {
      continue;
    }
    if (getComponent(entity, buildSiteComponent) !== undefined) {
      reasons.push({
        kind: PlacementReasonKind.SiteExists,
        text: "another job already builds here",
        params: { jobId: id },
      });
    } else if (
      hasComponent(entity, furnitureComponent) ||
      entity.prototype === wallPrototypeId ||
      entity.prototype === doorPrototypeId ||
      entity.prototype === buildSitePrototypeId ||
      entity.prototype === jobBoardPrototypeId
    ) {
      reasons.push({
        kind: PlacementReasonKind.Occupied,
        text: `${entity.prototype} stands here`,
        params: { entityId: id, prototypeId: entity.prototype },
      });
    }
  }
  return result(
    prototypeId,
    mapId,
    cellIndex,
    reasons,
    unlockTier,
    zoneAt(engine, mapId, cellIndex),
  );
}

/**
 * Throws the command error for a refused placement (DECISIONS section 3.3): the first reason
 * decides the kind (`UnknownMap` and `OutOfBounds` give `OutOfBounds`, `TierLocked` gives
 * `ContentLocked`, `TerrainNotBuildable` gives `LocationBlocked`, `Occupied` and `SiteExists`
 * give `LocationAlreadyOccupied`). Does nothing for a valid placement.
 *
 * @param placement - The result of {@link validatePlacement}.
 */
export function assertPlacementValid(placement: PlacementResult): void {
  const reason = placement.reasons[0];
  if (reason === undefined) {
    return;
  }
  let kind: ConstructionErrorKind;
  switch (reason.kind) {
    case PlacementReasonKind.UnknownMap:
    case PlacementReasonKind.OutOfBounds:
      kind = ConstructionErrorKind.OutOfBounds;
      break;
    case PlacementReasonKind.UnknownPrototype:
      kind = ConstructionErrorKind.UnknownPrototype;
      break;
    case PlacementReasonKind.TierLocked:
      kind = ConstructionErrorKind.ContentLocked;
      break;
    case PlacementReasonKind.TerrainNotBuildable:
      kind = ConstructionErrorKind.LocationBlocked;
      break;
    case PlacementReasonKind.Occupied:
    case PlacementReasonKind.SiteExists:
      kind = ConstructionErrorKind.LocationAlreadyOccupied;
      break;
  }
  throw new ConstructionError(
    kind,
    `cannot place ${placement.prototypeId} on cell ${placement.cellIndex} of map ${placement.mapId}: ${reason.text}`,
  );
}
