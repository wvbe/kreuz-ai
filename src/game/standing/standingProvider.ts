import { StatusState, StatusSubjectKind } from "../status/statusTypes";
import type { StatusProvider, StatusSubjectRef, SubjectStatus } from "../status/statusTypes";
import { getStandingService } from "./standingServiceRegistry";
import { standingReasons } from "./standingReasons";

/**
 * The status provider of standing orders (spec 026 FR-025, spec 025): every live order is a
 * subject. A paused order is Blocked with `Paused`, an order with another reason (`NoSteward`,
 * `NoSeatOfGovernment`, `LockedByTier`, `ScopeZoneMissing`, `NoReachableJobBoard`,
 * `AwaitingTownCrier`, `MissingInput`, `MissingWorkstation`, `NoQualifiedWorker` ...) is Blocked
 * with it, any other order is Active (restocking or satisfied). Deleted orders that only wait for
 * their last claimed run are no subjects.
 */
export const standingProvider: StatusProvider = {
  kind: StatusSubjectKind.StandingOrder,
  subjects: (engine) =>
    getStandingService(engine)
      .state.orders.filter((order) => !order.deleted)
      .map((order): StatusSubjectRef => ({
        kind: StatusSubjectKind.StandingOrder,
        id: order.orderId,
      })),
  evaluate: (engine, ref): SubjectStatus | null => {
    const order = getStandingService(engine).find(ref.id);
    if (order === undefined || order.deleted) {
      return null;
    }
    const reasons = standingReasons(engine, order);
    return {
      state: reasons.length === 0 ? StatusState.Active : StatusState.Blocked,
      activity: null,
      reasons,
    };
  },
};
