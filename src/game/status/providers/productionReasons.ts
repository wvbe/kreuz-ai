import { CauseSubjectKind } from "../../production/productionTypes";
import type { CauseRef, ProductionBlockedReason } from "../../production/productionTypes";
import { makeReason, toReasonKind } from "../reasons";
import { StatusSubjectKind } from "../statusTypes";
import type { Reason, StatusSubjectRef } from "../statusTypes";

/**
 * Maps a production `causeRef` (zone or workstation) to a status subject.
 *
 * @param cause - The production cause, or null.
 * @returns The subject, or null.
 */
export function fromProductionCause(cause: CauseRef | null): StatusSubjectRef | null {
  if (cause === null) {
    return null;
  }
  return {
    kind:
      cause.kind === CauseSubjectKind.Zone ? StatusSubjectKind.Zone : StatusSubjectKind.Workstation,
    id: cause.entityId,
  };
}

/**
 * Maps the reasons that production reports (`explainOrder`, `explainWorkstation`, same names as
 * spec 025) to status reasons.
 *
 * @param reasons - Production reasons.
 * @returns Status reasons in the same order.
 */
export function fromProductionReasons(reasons: readonly ProductionBlockedReason[]): Reason[] {
  return reasons.map((reason) =>
    makeReason(toReasonKind(reason.kind), reason.params, fromProductionCause(reason.causeRef)),
  );
}
