import { getComponent } from "../../ecs/Entity";
import { explainOrder } from "../../production/productionBlockers";
import { findOrder, listWorkstations } from "../../production/productionQueries";
import { productionOrdersComponent } from "../../production/productionOrdersComponent";
import { OrderStatus } from "../../production/productionTypes";
import { StatusState, StatusSubjectKind } from "../statusTypes";
import type { Reason, StatusProvider, StatusSubjectRef, SubjectStatus } from "../statusTypes";
import { awaitingWorker } from "./awaitingWorker";
import { fromProductionReasons } from "./productionReasons";

/**
 * The status provider of production orders (the `ProductionOrder` view of DECISIONS D-49 over
 * `explainOrder`): an unfinished order is Blocked with the reasons production reports, Blocked
 * with `AwaitingWorker` while its craft job waits for a crafter, Active otherwise. Finished and
 * cancelled orders are not subjects.
 */
export const orderProvider: StatusProvider = {
  kind: StatusSubjectKind.ProductionOrder,
  subjects: (engine) => {
    const refs: StatusSubjectRef[] = [];
    for (const station of listWorkstations(engine)) {
      for (const order of getComponent(station, productionOrdersComponent)?.orders ?? []) {
        if (
          (order.status === OrderStatus.Active || order.status === OrderStatus.Paused) &&
          order.remaining > 0
        ) {
          refs.push({ kind: StatusSubjectKind.ProductionOrder, id: order.orderId });
        }
      }
    }
    return refs;
  },
  evaluate: (engine, ref): SubjectStatus | null => {
    const found = findOrder(engine, ref.id);
    if (
      found === null ||
      !(found.order.status === OrderStatus.Active || found.order.status === OrderStatus.Paused)
    ) {
      return null;
    }
    const reasons: Reason[] = fromProductionReasons(explainOrder(engine, ref.id).reasons);
    const posted = awaitingWorker(engine, found.order.postingId);
    if (posted !== null) {
      reasons.push(posted);
    }
    return {
      state: reasons.length === 0 ? StatusState.Active : StatusState.Blocked,
      activity: null,
      reasons,
    };
  },
};
