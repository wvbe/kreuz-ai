import { getComponent } from "../../ecs/Entity";
import { getAllItems } from "../../inventory/inventoryQueries";
import { activePostingsOfType } from "../../jobs/jobBoards";
import { PostingStatus } from "../../jobs/jobTypes";
import { positionComponent } from "../../map/positionComponent";
import { isLoosePile } from "../../storage/storageQueries";
import { chooseRoute } from "../../storage/storageRouting";
import { haulJobId } from "../../storage/storageTypes";
import { makeReason } from "../reasons";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import type { Reason, StatusProvider, SubjectStatus } from "../statusTypes";
import { awaitingWorker } from "./awaitingWorker";

/**
 * The status provider of loose piles (spec 025 subject `LoosePile`, DECISIONS D-18): per material
 * in the pile, `NoStorageDestination {materialId}` when no storage accepts it, and
 * `AwaitingWorker` while its haul posting waits for a hauler; Active when every material has a
 * destination and a hauler on it or a posting still to come.
 */
export const loosePileProvider: StatusProvider = {
  kind: StatusSubjectKind.LoosePile,
  subjects: (engine) =>
    engine.store
      .entities()
      .filter((entity) => isLoosePile(entity) && !engine.store.isPendingDelete(entity.id))
      .filter((entity) => getAllItems(entity).length > 0)
      .map((entity) => ({ kind: StatusSubjectKind.LoosePile, id: entity.id })),
  evaluate: (engine, ref): SubjectStatus | null => {
    const entity = engine.store.get(ref.id);
    const place = entity === undefined ? undefined : getComponent(entity, positionComponent);
    if (
      entity === undefined ||
      place === undefined ||
      !isLoosePile(entity) ||
      engine.store.isPendingDelete(ref.id)
    ) {
      return null;
    }
    const reasons: Reason[] = [];
    const postings = activePostingsOfType(engine, haulJobId);
    for (const item of getAllItems(entity)) {
      const route = chooseRoute(engine, {
        materialId: item.materialId,
        quantity: item.quantity,
        actorId: null,
        mapId: place.mapId,
        fromCell: place.cellIndex,
      });
      if (route === null) {
        reasons.push(
          makeReason(BlockedReasonKind.NoStorageDestination, { materialId: item.materialId }),
        );
        continue;
      }
      const posting = postings.find(
        (candidate) =>
          candidate.target.entityId === entity.id &&
          candidate.target.materialId === item.materialId &&
          candidate.status === PostingStatus.Open,
      );
      const waiting = awaitingWorker(engine, posting?.id ?? null);
      if (waiting !== null) {
        reasons.push(waiting);
      }
    }
    return {
      state: reasons.length === 0 ? StatusState.Active : StatusState.Blocked,
      activity: null,
      reasons,
    };
  },
};
