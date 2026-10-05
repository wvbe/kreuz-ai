import { describe, expect, it } from "vitest";
import { evaluateSubject, explain } from "./explain";
import { makeReason } from "./reasons";
import {
  BlockedReasonKind,
  ChainEnd,
  maxExplanationDepth,
  StatusState,
  StatusSubjectKind,
} from "./statusTypes";
import type { StatusSubjectRef, SubjectStatus } from "./statusTypes";
import { createStatusWorld } from "./testStatusWorld";

const order = (id: number): StatusSubjectRef => ({ kind: StatusSubjectKind.StandingOrder, id });

function blockedBy(
  cause: StatusSubjectRef | null,
  kind = BlockedReasonKind.MissingInput,
): SubjectStatus {
  return {
    state: StatusState.Blocked,
    activity: null,
    reasons: [makeReason(kind, { materialId: "flour" }, cause)],
  };
}

describe("evaluateSubject", () => {
  it("returns null for an unknown subject or a kind without a provider", () => {
    const world = createStatusWorld();
    expect(evaluateSubject(world.engine, order(1))).toBeNull();
    expect(evaluateSubject(world.engine, { kind: StatusSubjectKind.Dwelling, id: 1 })).toBeNull();
  });

  it("sorts the reasons by precedence", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, {
      state: StatusState.Blocked,
      activity: null,
      reasons: [
        makeReason(BlockedReasonKind.OutputBlocked, { materialId: "bread" }),
        makeReason(BlockedReasonKind.Paused),
      ],
    });
    const status = evaluateSubject(world.engine, order(1));
    expect(status?.reasons.map((reason) => reason.kind)).toEqual([
      BlockedReasonKind.Paused,
      BlockedReasonKind.OutputBlocked,
    ]);
  });

  it("gives a non-Active subject without a reason the visible fallback Unexplained", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, { state: StatusState.Idle, activity: null, reasons: [] });
    expect(evaluateSubject(world.engine, order(1))?.reasons.map((reason) => reason.kind)).toEqual([
      BlockedReasonKind.Unexplained,
    ]);
  });

  it("drops reasons of an Active subject", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, {
      state: StatusState.Active,
      activity: null,
      reasons: [makeReason(BlockedReasonKind.Paused)],
    });
    expect(evaluateSubject(world.engine, order(1))?.reasons).toEqual([]);
  });
});

describe("explain", () => {
  it("returns null for a subject that does not exist", () => {
    const world = createStatusWorld();
    expect(explain(world.engine, order(5))).toBeNull();
  });

  it("explains an Active subject with a one-link chain", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, { state: StatusState.Active, activity: null, reasons: [] });
    const explanation = explain(world.engine, order(1));
    expect(explanation?.state).toBe(StatusState.Active);
    expect(explanation?.chain).toHaveLength(1);
    expect(explanation?.chain[0]?.reason).toBeNull();
    expect(explanation?.end).toBe(ChainEnd.Complete);
  });

  it("follows the cause of the primary reason down the chain", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, blockedBy(order(2)));
    world.setSynthetic(2, blockedBy(order(3), BlockedReasonKind.AwaitingWorker));
    world.setSynthetic(3, blockedBy(null, BlockedReasonKind.NoQualifiedWorker));
    const explanation = explain(world.engine, order(1));
    expect(explanation?.chain.map((link) => link.subject.id)).toEqual([1, 2, 3]);
    expect(explanation?.chain.map((link) => link.reason?.kind)).toEqual([
      BlockedReasonKind.MissingInput,
      BlockedReasonKind.AwaitingWorker,
      BlockedReasonKind.NoQualifiedWorker,
    ]);
    expect(explanation?.end).toBe(ChainEnd.Complete);
  });

  it("stops at a repeated subject (cycle protection)", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, blockedBy(order(2)));
    world.setSynthetic(2, blockedBy(order(1)));
    const explanation = explain(world.engine, order(1));
    expect(explanation?.chain.map((link) => link.subject.id)).toEqual([1, 2]);
    expect(explanation?.end).toBe(ChainEnd.Cycle);
  });

  it("stops at a subject pointing at itself", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, blockedBy(order(1)));
    const explanation = explain(world.engine, order(1));
    expect(explanation?.chain).toHaveLength(1);
    expect(explanation?.end).toBe(ChainEnd.Cycle);
  });

  it("caps the number of followed causes at maxExplanationDepth", () => {
    const world = createStatusWorld();
    for (let id = 1; id <= 12; id += 1) {
      world.setSynthetic(id, blockedBy(order(id + 1)));
    }
    const explanation = explain(world.engine, order(1));
    expect(explanation?.chain).toHaveLength(maxExplanationDepth + 1);
    expect(explanation?.chain.at(-1)?.subject.id).toBe(maxExplanationDepth + 1);
    expect(explanation?.end).toBe(ChainEnd.DepthCap);
  });

  it("ends with Gone when the cause no longer exists", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, blockedBy(order(99)));
    const explanation = explain(world.engine, order(1));
    expect(explanation?.chain).toHaveLength(1);
    expect(explanation?.end).toBe(ChainEnd.Gone);
    expect(explanation?.reasons[0]?.causeRef).toEqual(order(99));
  });

  it("is pure: asking twice gives the same answer and stores nothing", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, blockedBy(order(2)));
    world.setSynthetic(2, blockedBy(null));
    const first = explain(world.engine, order(1));
    expect(explain(world.engine, order(1))).toEqual(first);
    expect(world.engine.saveGame()).toContain('"statuses":{"records":[]}');
  });
});
