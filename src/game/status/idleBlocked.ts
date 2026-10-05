import type { GameEngine } from "../engine/GameEngine";
import { evaluateSubject } from "./explain";
import { createStatusContext } from "./statusContext";
import { listSubjects } from "./statusEvaluation";
import { getStatusService } from "./statusServiceRegistry";
import { StatusState, StatusSubjectKind } from "./statusTypes";
import type { IdleBlockedRow } from "./statusTypes";

/**
 * Filters of the Idle & Blocked list.
 */
export type IdleBlockedOptions = {
  /**
   * Include subjects whose state or primary reason has not held the grace period yet (default
   * false: the list shows settled subjects only, spec 025 FR-017).
   */
  includeUnsettled?: boolean;
  state?: StatusState;
  kind?: StatusSubjectKind;
};

const kindOrder: readonly StatusSubjectKind[] = Object.values(StatusSubjectKind);

/**
 * The Idle & Blocked list (spec 025 FR-017): every non-Active subject with its reasons (derived
 * now) and `sinceTick` (kept by the settle tracker: the first tick of the continuous stall).
 * Sorted by `sinceTick` ascending, then subject kind and id. A row is `settled` when the subject
 * has been published in this state (it held the grace period); a later change of the primary
 * reason inside the stall keeps the row settled and shows the reasons derived now.
 *
 * @param engine - The engine.
 * @param options - Filters.
 * @returns The rows.
 */
export function buildIdleBlockedView(
  engine: GameEngine,
  options: IdleBlockedOptions = {},
): IdleBlockedRow[] {
  const tracker = getStatusService(engine).tracker;
  const context = createStatusContext(engine);
  const rows: IdleBlockedRow[] = [];
  for (const ref of listSubjects(engine)) {
    if (options.kind !== undefined && ref.kind !== options.kind) {
      continue;
    }
    const status = evaluateSubject(engine, ref, context);
    if (status === null || status.state === StatusState.Active) {
      continue;
    }
    if (options.state !== undefined && status.state !== options.state) {
      continue;
    }
    const record = tracker.get(ref);
    const primary = status.reasons[0];
    const published = record !== null && record.state === status.state;
    const sinceTick =
      record === null
        ? engine.time.tickCount
        : record.state !== StatusState.Active
          ? record.sinceTick
          : (record.stallStart ?? engine.time.tickCount);
    if (!published && options.includeUnsettled !== true) {
      continue;
    }
    if (primary !== undefined) {
      rows.push({
        subject: ref,
        state: status.state,
        reasons: status.reasons,
        sinceTick,
        settled: published,
      });
    }
  }
  return rows.sort(
    (left, right) =>
      left.sinceTick - right.sinceTick ||
      kindOrder.indexOf(left.subject.kind) - kindOrder.indexOf(right.subject.kind) ||
      left.subject.id - right.subject.id,
  );
}
