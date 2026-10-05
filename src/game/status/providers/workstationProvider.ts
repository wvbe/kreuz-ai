import type { GameEngine } from "../../engine/GameEngine";
import { explainWorkstation } from "../../production/productionBlockers";
import { findWorkstation, listWorkstations } from "../../production/productionQueries";
import { OrderStatus } from "../../production/productionTypes";
import { BlockedReasonKind, ActivityKind, StatusState, StatusSubjectKind } from "../statusTypes";
import type { Reason, StatusProvider, SubjectStatus } from "../statusTypes";
import { awaitingWorker } from "./awaitingWorker";
import { fromProductionReasons } from "./productionReasons";

function postedReason(engine: GameEngine, workstationId: number): Reason | null {
  const found = findWorkstation(engine, workstationId);
  if (found === null || found.data.craft !== null) {
    return null;
  }
  for (const order of found.data.orders) {
    if (order.status === OrderStatus.Active && order.remaining > 0) {
      const waiting = awaitingWorker(engine, order.postingId);
      if (waiting !== null) {
        return waiting;
      }
    }
  }
  return null;
}

/**
 * The status provider of workstations (spec 025 subject `Workstation`): Idle with `NoOrders`
 * without an active order, Blocked with the reasons of its first order that cannot start
 * (`explainWorkstation` of production), Blocked with `AwaitingWorker` while its craft job waits
 * on the board, Active while it crafts.
 */
export const workstationProvider: StatusProvider = {
  kind: StatusSubjectKind.Workstation,
  subjects: (engine) =>
    listWorkstations(engine)
      .filter((station) => !engine.store.isPendingDelete(station.id))
      .map((station) => ({ kind: StatusSubjectKind.Workstation, id: station.id })),
  evaluate: (engine, ref): SubjectStatus | null => {
    const found = findWorkstation(engine, ref.id);
    if (found === null || engine.store.isPendingDelete(ref.id)) {
      return null;
    }
    const reasons = fromProductionReasons(explainWorkstation(engine, ref.id));
    const posted = postedReason(engine, ref.id);
    if (posted !== null) {
      reasons.push(posted);
    }
    const first = reasons[0];
    if (first === undefined) {
      const craft = found.data.craft;
      return {
        state: StatusState.Active,
        activity:
          craft === null
            ? null
            : {
                kind: ActivityKind.Crafting,
                params: { recipeId: craft.recipeId, crafterId: craft.crafterId },
              },
        reasons: [],
      };
    }
    return {
      state: first.kind === BlockedReasonKind.NoOrders ? StatusState.Idle : StatusState.Blocked,
      activity: null,
      reasons,
    };
  },
};
