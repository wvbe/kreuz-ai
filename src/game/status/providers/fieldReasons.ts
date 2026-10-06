import type { EntityId } from "../../ecs/Entity";
import type { GameEngine } from "../../engine/GameEngine";
import { fertileCellsOf } from "../../gathering/cropPlots";
import { farmFieldZoneTypeId, harvestJobId, sowJobId } from "../../gathering/gatheringTypes";
import { activePostingsOfType } from "../../jobs/jobBoards";
import { PostingStatus } from "../../jobs/jobTypes";
import { getZoneService } from "../../zones/zoneServiceRegistry";
import { awaitingWorker } from "./awaitingWorker";
import { makeReason } from "../reasons";
import { BlockedReasonKind } from "../statusTypes";
import type { Reason } from "../statusTypes";

/**
 * The reasons of an active `farm_field` zone that is not simply working (spec 025 Zone subject,
 * task 3.7a): `LocationBlocked {zoneId, zoneTypeId}` when none of its tiles is fertile soil
 * (nothing can grow there), otherwise `AwaitingWorker {postingId}` (cause: the posting) for the
 * lowest open `farm.sow` or `farm.harvest` posting on one of its fertile cells, which says the
 * field waits for a farmer (the posting explains why nobody claims it). An empty list means the
 * field is being worked or has nothing to do.
 *
 * @param engine - The engine.
 * @param zoneId - Zone id of a field.
 * @returns The reasons, empty for other zone types.
 */
export function fieldReasons(engine: GameEngine, zoneId: EntityId): Reason[] {
  const zone = getZoneService(engine).getZone(zoneId);
  if (zone === null || zone.data.zoneTypeId !== farmFieldZoneTypeId) {
    return [];
  }
  const cells = new Set(fertileCellsOf(engine, zoneId));
  if (cells.size === 0) {
    return [
      makeReason(BlockedReasonKind.LocationBlocked, {
        zoneId,
        zoneTypeId: zone.data.zoneTypeId,
      }),
    ];
  }
  const open = [
    ...activePostingsOfType(engine, sowJobId),
    ...activePostingsOfType(engine, harvestJobId),
  ]
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
