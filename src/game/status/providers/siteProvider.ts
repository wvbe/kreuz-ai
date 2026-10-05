import type { GameEngine } from "../../engine/GameEngine";
import { findSite, listSites } from "../../construction/buildSiteQueries";
import { siteBlockers } from "../../construction/siteBlockers";
import { ConstructionBlockedKind } from "../../construction/constructionTypes";
import { inputProducer } from "../../production/productionBlockers";
import { makeReason, toReasonKind } from "../reasons";
import { StatusState, StatusSubjectKind } from "../statusTypes";
import type { Reason, StatusProvider, SubjectStatus } from "../statusTypes";
import { awaitingWorker } from "./awaitingWorker";
import { fromProductionCause } from "./productionReasons";

function siteReasons(engine: GameEngine, jobId: number): Reason[] | null {
  const site = findSite(engine, jobId);
  if (site === null) {
    return null;
  }
  const reasons = siteBlockers(engine, site).map((blocked) => {
    if (blocked.kind !== ConstructionBlockedKind.MissingInput) {
      return makeReason(toReasonKind(blocked.kind), blocked.params);
    }
    const materialId = String(blocked.params["materialId"] ?? "");
    const producer = inputProducer(engine, materialId, 0);
    return makeReason(
      toReasonKind(blocked.kind),
      { ...blocked.params, noProducer: producer.noProducer },
      fromProductionCause(producer.causeRef),
    );
  });
  const posted = awaitingWorker(engine, site.data.postingId);
  if (posted !== null) {
    reasons.push(posted);
  }
  return reasons;
}

/**
 * The status provider of construction and deconstruction jobs (spec 025 subject
 * `ConstructionSite`): the reasons of `siteBlockers` (`LockedByTier`, `Paused`, `MissingInput`
 * with the producer chain of FR-009) and `AwaitingWorker` while the supply or build posting waits.
 */
export const siteProvider: StatusProvider = {
  kind: StatusSubjectKind.ConstructionSite,
  subjects: (engine) =>
    listSites(engine).map((site) => ({
      kind: StatusSubjectKind.ConstructionSite,
      id: site.entity.id,
    })),
  evaluate: (engine, ref): SubjectStatus | null => {
    const reasons = siteReasons(engine, ref.id);
    if (reasons === null) {
      return null;
    }
    return {
      state: reasons.length === 0 ? StatusState.Active : StatusState.Blocked,
      activity: null,
      reasons,
    };
  },
};
