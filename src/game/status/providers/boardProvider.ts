import { getComponent } from "../../ecs/Entity";
import { getBoard, listBoards } from "../../jobs/jobBoards";
import { jobBoardComponent } from "../../jobs/jobBoardComponent";
import { positionComponent } from "../../map/positionComponent";
import { zoneAt } from "../../zones/zoneQueries";
import { makeReason } from "../reasons";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import type { Reason, StatusProvider, SubjectStatus } from "../statusTypes";

/**
 * The status provider of job boards (spec 025 subject `JobBoard`): Blocked with `Paused` when the
 * player paused it and with `ZoneInactive {zoneId}` (cause: the zone) when the system paused it
 * because its zone is not active; Active otherwise.
 */
export const boardProvider: StatusProvider = {
  kind: StatusSubjectKind.JobBoard,
  subjects: (engine) =>
    listBoards(engine)
      .filter((board) => !engine.store.isPendingDelete(board.id))
      .map((board) => ({ kind: StatusSubjectKind.JobBoard, id: board.id })),
  evaluate: (engine, ref): SubjectStatus | null => {
    const found = getBoard(engine, ref.id);
    if (found === null || engine.store.isPendingDelete(ref.id)) {
      return null;
    }
    const data = getComponent(found.board, jobBoardComponent);
    const reasons: Reason[] = [];
    if (data?.pausedByPlayer === true) {
      reasons.push(makeReason(BlockedReasonKind.Paused, { jobBoardId: ref.id }));
    }
    if (data?.pausedBySystem === true) {
      const place = getComponent(found.board, positionComponent);
      const zoneId = place === undefined ? null : zoneAt(engine, place.mapId, place.cellIndex);
      reasons.push(
        zoneId === null
          ? makeReason(BlockedReasonKind.Paused, { jobBoardId: ref.id })
          : makeReason(
              BlockedReasonKind.ZoneInactive,
              { zoneId },
              { kind: StatusSubjectKind.Zone, id: zoneId },
            ),
      );
    }
    return {
      state: reasons.length === 0 ? StatusState.Active : StatusState.Blocked,
      activity: null,
      reasons,
    };
  },
};
