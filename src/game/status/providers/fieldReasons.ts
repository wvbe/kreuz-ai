import type { EntityId } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import { cropCellsOf, harvestJobOf, isCropZoneType } from "../../gathering/cropPlots";
import {
  fishCatchJobId,
  fishingDockZoneTypeId,
  fishingWaterTerrainId,
  sowJobId,
} from "../../gathering/gatheringTypes";
import { activePostingsOfType } from "../../jobs/jobBoards";
import { PostingStatus } from "../../jobs/jobTypes";
import { getZoneService } from "../../zones/zoneServiceRegistry";
import { awaitingWorker } from "./awaitingWorker";
import { makeReason } from "../reasons";
import { BlockedReasonKind } from "../statusTypes";
import type { Reason } from "../statusTypes";

/**
 * The reasons of an active crop or fishing zone that is not simply working (spec 025 Zone
 * subject, tasks 3.7a and 5.3, DECISIONS D-130): `LocationBlocked {zoneId, zoneTypeId}` when none
 * of its tiles can work (no tile of the crop terrain for a field, orchard, vineyard or herb
 * garden; no dock tile next to shallow water for a fishing dock), otherwise `AwaitingWorker
 * {postingId}` (cause: the posting) for the lowest open posting of the zone's jobs (`farm.sow`
 * and its harvest job, or `fish.catch`) on one of its cells, which says the zone waits for a
 * worker (the posting explains why nobody claims it). An empty list means the zone is being
 * worked or has nothing to do.
 *
 * @param engine - The engine.
 * @param zoneId - Zone id.
 * @returns The reasons, empty for other zone types.
 */
export function fieldReasons(engine: GameEngine, zoneId: EntityId): Reason[] {
  const zone = getZoneService(engine).getZone(zoneId);
  if (zone === null) {
    return [];
  }
  const zoneTypeId = zone.data.zoneTypeId;
  const map = engine.maps.get(zone.data.mapId);
  let cells: Set<number>;
  let jobIds: string[];
  if (isCropZoneType(engine, zoneTypeId)) {
    cells = new Set(cropCellsOf(engine, zoneId));
    jobIds = [sowJobId, harvestJobOf(engine, zoneTypeId)];
  } else if (zoneTypeId === fishingDockZoneTypeId && map !== undefined) {
    cells = new Set(
      zone.data.tiles.filter((cell) =>
        map.neighbors(cell).some((next) => map.terrainAt(next) === fishingWaterTerrainId),
      ),
    );
    jobIds = [fishCatchJobId];
  } else {
    return [];
  }
  if (cells.size === 0) {
    return [makeReason(BlockedReasonKind.LocationBlocked, { zoneId, zoneTypeId })];
  }
  const open = jobIds
    .flatMap((jobId) => activePostingsOfType(engine, jobId))
    .filter(
      (posting) =>
        posting.status === PostingStatus.Open &&
        posting.target.mapId === zone.data.mapId &&
        cells.has(posting.target.cellIndex),
    )
    .sort((left, right) => left.id - right.id);
  const first = open[0];
  const reason = first === undefined ? null : awaitingWorker(engine, first.id);
  return reason === null ? [] : [reason];
}
