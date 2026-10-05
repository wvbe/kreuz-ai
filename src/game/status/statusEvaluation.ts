import type { GameEngine } from "../engine/GameEngine";
import { evaluateSubject } from "./explain";
import { refKey } from "./reasons";
import { createStatusContext } from "./statusContext";
import { getStatusService } from "./statusServiceRegistry";
import { statusBlockedEvent, statusUnblockedEvent } from "./statusTypes";
import type { StatusBlocked, StatusSubjectRef, StatusUnblocked } from "./statusTypes";

/**
 * Lists every live subject of every registered provider in the order spec 025 FR-008 asks for:
 * providers in registration order, each provider's subjects in its own stable order.
 *
 * @param engine - The engine.
 * @returns The subject refs.
 */
export function listSubjects(engine: GameEngine): StatusSubjectRef[] {
  return getStatusService(engine)
    .providers()
    .flatMap((provider) => provider.subjects(engine));
}

/**
 * The slot-18 pass (spec 025 FR-006 to FR-008): evaluates every subject (pure derivation), feeds
 * the settle tracker and emits `status.blocked` for a subject that settled into a non-Active
 * state or whose published primary reason changed, and `status.unblocked` for one that became
 * Active or disappeared. Draws no random numbers; the same state gives the same events.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns How many events were emitted.
 */
export function runStatusPass(engine: GameEngine, tick: number): number {
  const service = getStatusService(engine);
  const context = createStatusContext(engine);
  const live = new Set<string>();
  let emitted = 0;
  for (const ref of listSubjects(engine)) {
    const status = evaluateSubject(engine, ref, context);
    if (status === null) {
      continue;
    }
    live.add(refKey(ref));
    const transition = service.tracker.observe(ref, status, tick);
    if (transition.blocked !== null) {
      const payload: StatusBlocked = transition.blocked;
      engine.bus.emit(statusBlockedEvent, payload);
      emitted += 1;
    }
    if (transition.unblocked !== null) {
      const payload: StatusUnblocked = transition.unblocked;
      engine.bus.emit(statusUnblockedEvent, payload);
      emitted += 1;
    }
  }
  for (const removed of service.tracker.retainOnly(live, tick)) {
    engine.bus.emit(statusUnblockedEvent, removed);
    emitted += 1;
  }
  return emitted;
}
