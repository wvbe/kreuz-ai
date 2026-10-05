import type { GameEngine } from "../engine/GameEngine";
import { makeReason, refKey, sortReasons } from "./reasons";
import { createStatusContext } from "./statusContext";
import type { StatusContext } from "./statusContext";
import { getStatusService } from "./statusServiceRegistry";
import { BlockedReasonKind, ChainEnd, maxExplanationDepth, StatusState } from "./statusTypes";
import type { ChainLink, Explanation, StatusSubjectRef, SubjectStatus } from "./statusTypes";

/**
 * Evaluates one subject through its provider (pure derivation, spec 025 FR-008): the reasons come
 * back in the precedence order of FR-004, and a non-Active subject whose provider found no reason
 * gets the visible fallback `Unexplained` so that no stall is ever silent.
 *
 * @param engine - The engine.
 * @param ref - The subject.
 * @param context - The memo of the current pass (default: a fresh one).
 * @returns The status, or null when the subject does not exist or has no provider.
 */
export function evaluateSubject(
  engine: GameEngine,
  ref: StatusSubjectRef,
  context: StatusContext = createStatusContext(engine),
): SubjectStatus | null {
  const provider = getStatusService(engine).providerOf(ref.kind);
  const status = provider?.evaluate(engine, ref, context) ?? null;
  if (status === null) {
    return null;
  }
  if (status.state === StatusState.Active) {
    return { state: status.state, activity: status.activity, reasons: [] };
  }
  const reasons = sortReasons(status.reasons);
  return {
    state: status.state,
    activity: status.activity,
    reasons: reasons.length === 0 ? [makeReason(BlockedReasonKind.Unexplained)] : reasons,
  };
}

/**
 * Explains a subject (spec 025 FR-010, the "why?" of the renderer): its status and the chain of
 * causes of its primary reason. The chain starts with the subject itself; each next link is the
 * subject the previous link's primary reason points at (`causeRef`), with that subject's own
 * primary reason. It stops at a subject already in the chain (`Cycle`), after
 * `maxExplanationDepth` causes (`DepthCap`), or at a cause that is gone (`Gone`). Pure: nothing is
 * stored, so the answer is always the current truth.
 *
 * @param engine - The engine.
 * @param ref - The subject.
 * @returns The explanation, or null when the subject does not exist.
 */
export function explain(engine: GameEngine, ref: StatusSubjectRef): Explanation | null {
  const context = createStatusContext(engine);
  const first = evaluateSubject(engine, ref, context);
  if (first === null) {
    return null;
  }
  const chain: ChainLink[] = [];
  const seen = new Set<string>();
  let current: StatusSubjectRef = ref;
  let status: SubjectStatus = first;
  let end = ChainEnd.Complete;
  for (;;) {
    seen.add(refKey(current));
    const primary = status.reasons[0] ?? null;
    chain.push({
      subject: { ...current },
      state: status.state,
      activity: status.activity,
      reason: primary,
    });
    const cause = primary?.causeRef ?? null;
    if (cause === null) {
      break;
    }
    if (seen.has(refKey(cause))) {
      end = ChainEnd.Cycle;
      break;
    }
    if (chain.length > maxExplanationDepth) {
      end = ChainEnd.DepthCap;
      break;
    }
    const next = evaluateSubject(engine, cause, context);
    if (next === null) {
      end = ChainEnd.Gone;
      break;
    }
    current = cause;
    status = next;
  }
  return {
    subject: { ...ref },
    state: first.state,
    activity: first.activity,
    reasons: first.reasons,
    chain,
    end,
  };
}
