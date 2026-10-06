import { describe, expect, it } from "vitest";
import { evaluateSubject, explain } from "../status/explain";
import { createStatusContext } from "../status/statusContext";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../status/statusTypes";
import { standingProvider } from "./standingProvider";
import { createStandingWorld } from "./testStandingWorld";

function ref(id: number) {
  return { kind: StatusSubjectKind.StandingOrder, id };
}

describe("standingProvider", () => {
  it("lists the live orders as subjects, not deleted ones", () => {
    const world = createStandingWorld();
    const bread = world.standing({ materialId: "bread" });
    const flour = world.standing({ materialId: "flour", recipeId: "grind_flour" });
    expect(standingProvider.subjects(world.engine)).toEqual([ref(bread), ref(flour)]);
    world.command("DeleteStandingOrder", { orderId: bread });
    expect(standingProvider.subjects(world.engine)).toEqual([ref(flour)]);
  });

  it("is Active when nothing blocks the order", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.userBoard();
    world.throneRoom(5, 5);
    world.steward(2);
    const id = world.standing();
    expect(evaluateSubject(world.engine, ref(id))).toEqual({
      state: StatusState.Active,
      activity: null,
      reasons: [],
    });
  });

  it("is Blocked with NoSteward and NoSeatOfGovernment without an office (US3)", () => {
    const world = createStandingWorld();
    const id = world.standing();
    const status = evaluateSubject(world.engine, ref(id));
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons.map((reason) => reason.kind)).toEqual([
      BlockedReasonKind.NoSeatOfGovernment,
      BlockedReasonKind.NoSteward,
      BlockedReasonKind.NoReachableJobBoard,
    ]);
  });

  it("is Blocked with Paused for a paused order and unknown for a missing or deleted one", () => {
    const world = createStandingWorld();
    const id = world.standing();
    world.command("PauseStandingOrder", { orderId: id });
    expect(evaluateSubject(world.engine, ref(id))?.reasons[0]).toMatchObject({
      kind: BlockedReasonKind.Paused,
    });
    expect(
      standingProvider.evaluate(world.engine, ref(99), createStatusContext(world.engine)),
    ).toBeNull();
    world.command("DeleteStandingOrder", { orderId: id });
    expect(evaluateSubject(world.engine, ref(id))).toBeNull();
  });

  it("answers `why` through the status system with the primary reason", () => {
    const world = createStandingWorld();
    const id = world.standing();
    const explanation = explain(world.engine, ref(id));
    expect(explanation?.chain[0]).toMatchObject({
      subject: ref(id),
      state: StatusState.Blocked,
    });
  });
});
