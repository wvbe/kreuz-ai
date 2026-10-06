import { describe, expect, it } from "vitest";
import { governmentFactionId } from "../factions/factionRegistry";
import { leaveFaction } from "../factions/factionMembership";
import { StandingOrderError } from "./StandingOrderError";
import { getStandingService } from "./standingServiceRegistry";
import { StandingOrderErrorKind, StewardVacancyReason } from "./standingTypes";
import {
  appointSteward,
  checkStewardOffice,
  dismissSteward,
  isEligibleSteward,
  requestStewardReview,
  setStewardBoard,
  vacateOffice,
} from "./steward";
import { createStandingWorld } from "./testStandingWorld";

function kindOf(action: () => void): StandingOrderErrorKind | null {
  try {
    action();
  } catch (failure) {
    return failure instanceof StandingOrderError ? failure.kind : null;
  }
  return null;
}

describe("isEligibleSteward", () => {
  // @covers 026:FR-013
  it("accepts a citizen of the player faction who is no Town Crier", () => {
    const world = createStandingWorld();
    const settler = world.settler(22);
    expect(isEligibleSteward(world.engine, settler.id)).toBe(true);
  });

  it("refuses a crier, a non-member, a non-citizen and a missing entity", () => {
    const world = createStandingWorld();
    const crier = world.crier(23);
    const outsider = world.spawn("peasant", 24);
    const chest = world.chest(25);
    expect(isEligibleSteward(world.engine, crier.id)).toBe(false);
    expect(isEligibleSteward(world.engine, outsider.id)).toBe(false);
    expect(isEligibleSteward(world.engine, chest.id)).toBe(false);
    expect(isEligibleSteward(world.engine, 9999)).toBe(false);
  });
});

describe("appointSteward and dismissSteward", () => {
  it("appoints, announces and does nothing for the sitting Steward", () => {
    const world = createStandingWorld();
    const appointed = world.record("steward.appointed");
    const settler = world.settler(22);
    expect(appointSteward(world.engine, settler.id)).toBe(true);
    expect(appointSteward(world.engine, settler.id)).toBe(false);
    world.run(1);
    expect(appointed).toEqual([{ entityId: settler.id }]);
    expect(getStandingService(world.engine).state.stewardEntityId).toBe(settler.id);
  });

  // @covers 026:FR-004 026:FR-013
  it("refuses an ineligible citizen with IneligibleSteward", () => {
    const world = createStandingWorld();
    const crier = world.crier(23);
    expect(kindOf(() => appointSteward(world.engine, crier.id))).toBe(
      StandingOrderErrorKind.IneligibleSteward,
    );
    expect(getStandingService(world.engine).state.stewardEntityId).toBeNull();
  });

  // @covers 026:FR-016
  it("replaces the old Steward with reason Replaced", () => {
    const world = createStandingWorld();
    const dismissed = world.record("steward.dismissed");
    const first = world.settler(22);
    const second = world.settler(23);
    appointSteward(world.engine, first.id);
    appointSteward(world.engine, second.id);
    world.run(1);
    expect(dismissed).toEqual([{ entityId: first.id, reason: StewardVacancyReason.Replaced }]);
    expect(getStandingService(world.engine).state.stewardEntityId).toBe(second.id);
  });

  it("dismisses with reason Dismissed once", () => {
    const world = createStandingWorld();
    const dismissed = world.record("steward.dismissed");
    const settler = world.steward(22);
    expect(dismissSteward(world.engine)).toBe(true);
    expect(dismissSteward(world.engine)).toBe(false);
    world.run(1);
    expect(dismissed).toEqual([{ entityId: settler.id, reason: StewardVacancyReason.Dismissed }]);
  });

  // @covers 026:FR-013
  it("keeps the Steward from being appointed Town Crier", () => {
    const world = createStandingWorld();
    const settler = world.steward(22);
    expect(() => world.command("AppointTownCrier", { entityId: settler.id })).toThrow();
    dismissSteward(world.engine);
    expect(() => world.command("AppointTownCrier", { entityId: settler.id })).not.toThrow();
  });
});

describe("vacateOffice", () => {
  it("does nothing when nobody holds it", () => {
    const world = createStandingWorld();
    expect(vacateOffice(world.engine, StewardVacancyReason.Died)).toBe(false);
  });
});

describe("setStewardBoard", () => {
  it("sets and clears a user-managed board and refuses any other", () => {
    const world = createStandingWorld();
    expect(kindOf(() => setStewardBoard(world.engine, world.boardId))).toBe(
      StandingOrderErrorKind.BoardNotUserManaged,
    );
    expect(kindOf(() => setStewardBoard(world.engine, 9999))).toBe(
      StandingOrderErrorKind.BoardNotUserManaged,
    );
    world.userBoard();
    setStewardBoard(world.engine, world.boardId);
    expect(getStandingService(world.engine).state.stewardBoardId).toBe(world.boardId);
    setStewardBoard(world.engine, null);
    expect(getStandingService(world.engine).state.stewardBoardId).toBeNull();
  });
});

describe("requestStewardReview", () => {
  // @covers 026:FR-017
  it("records one request, collapses repeats and is spent by the next review pass", () => {
    const world = createStandingWorld();
    const skipped = world.record("steward.review.skipped");
    world.run(5);
    const requested = world.engine.time.tickCount;
    requestStewardReview(world.engine);
    requestStewardReview(world.engine);
    expect(getStandingService(world.engine).state.extraReviewAfterTick).toBe(requested);
    world.run(2);
    expect(getStandingService(world.engine).state.extraReviewAfterTick).toBeNull();
    expect(skipped).toHaveLength(1);
  });
});

describe("checkStewardOffice", () => {
  it("is quiet while the Steward is a citizen of the faction", () => {
    const world = createStandingWorld();
    world.steward(22);
    expect(checkStewardOffice(world.engine)).toBe(false);
    expect(checkStewardOffice(createStandingWorld().engine)).toBe(false);
  });

  // @covers 026:FR-016
  it("vacates with Died when the entity is gone", () => {
    const world = createStandingWorld();
    const dismissed = world.record("steward.dismissed");
    const settler = world.steward(22);
    world.engine.store.requestDelete(settler.id);
    expect(checkStewardOffice(world.engine)).toBe(true);
    world.run(1);
    expect(dismissed).toEqual([{ entityId: settler.id, reason: StewardVacancyReason.Died }]);
  });

  // @covers 026:FR-016
  it("vacates with LeftFaction when the Steward leaves the player faction", () => {
    const world = createStandingWorld();
    const dismissed = world.record("steward.dismissed");
    const settler = world.steward(22);
    leaveFaction(world.engine, settler.id, governmentFactionId(world.engine) as number);
    expect(checkStewardOffice(world.engine)).toBe(true);
    world.run(1);
    expect(dismissed).toEqual([{ entityId: settler.id, reason: StewardVacancyReason.LeftFaction }]);
  });
});
