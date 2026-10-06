import { describe, expect, it } from "vitest";
import { pauseBoard } from "../../jobs/boardPause";
import { defaultEligibility } from "../../jobs/eligibility";
import { claimPosting } from "../../jobs/jobPostings";
import { EligibilityKind, PauseSource } from "../../jobs/jobTypes";
import { noAiOverride } from "../../jobs/testJobWorld";
import { createStatusContext } from "../statusContext";
import { evaluateSubject, explain } from "../explain";
import { ActivityKind, BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { postingProvider } from "./postingProvider";

const posting = (id: number) => ({ kind: StatusSubjectKind.JobPosting, id });

// @covers 017:FR-019
describe("postingProvider", () => {
  it("lists the active postings and returns null for a missing one", () => {
    const world = createStatusWorld();
    const first = world.postFell(33);
    const second = world.postFell(34);
    expect(postingProvider.subjects(world.engine)).toEqual([posting(first.id), posting(second.id)]);
    expect(
      postingProvider.evaluate(world.engine, posting(999), createStatusContext(world.engine)),
    ).toBeNull();
  });

  it("is Blocked with NoQualifiedWorker when there is no citizen at all", () => {
    const world = createStatusWorld();
    const open = world.postFell(33);
    const status = evaluateSubject(world.engine, posting(open.id));
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons[0]?.kind).toBe(BlockedReasonKind.NoQualifiedWorker);
  });

  it("names the skill when the eligible citizens lack it", () => {
    const world = createStatusWorld();
    world.spawn("peasant", 55, noAiOverride);
    const open = world.postFell(33, {
      eligibility: [
        ...defaultEligibility(),
        { kind: EligibilityKind.MinSkill, skillId: "woodcutting", level: 90 },
      ],
    });
    expect(evaluateSubject(world.engine, posting(open.id))?.reasons[0]).toEqual({
      kind: BlockedReasonKind.NoQualifiedWorker,
      params: { skillId: "woodcutting", requiredLevel: 90 },
      causeRef: null,
    });
  });

  it("is Blocked with Unreachable when no eligible citizen can walk to the target", () => {
    const world = createStatusWorld();
    const map = world.engine.maps.require(world.mapId);
    for (const cell of [98, 89, 88]) {
      map.setTerrain(cell, "rock_wall");
    }
    world.spawn("peasant", 55, noAiOverride);
    const open = world.postFell(99);
    expect(evaluateSubject(world.engine, posting(open.id))?.reasons[0]?.kind).toBe(
      BlockedReasonKind.Unreachable,
    );
  });

  it("is Blocked with AwaitingWorker while eligible citizens are around, and Paused with the board as cause", () => {
    const world = createStatusWorld();
    world.spawn("peasant", 55, noAiOverride);
    const open = world.postFell(33);
    expect(evaluateSubject(world.engine, posting(open.id))?.reasons[0]).toEqual({
      kind: BlockedReasonKind.AwaitingWorker,
      params: { postingId: open.id },
      causeRef: null,
    });
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    const explanation = explain(world.engine, posting(open.id));
    expect(explanation?.reasons[0]?.kind).toBe(BlockedReasonKind.Paused);
    expect(explanation?.chain[1]?.subject).toEqual({
      kind: StatusSubjectKind.JobBoard,
      id: world.boardId,
    });
  });

  it("is Active and shows the claimant once claimed", () => {
    const world = createStatusWorld();
    const settler = world.spawn("peasant", 55, noAiOverride);
    const open = world.postFell(33);
    claimPosting(world.engine, open.id, settler.id, world.engine.time.tickCount);
    const status = evaluateSubject(world.engine, posting(open.id));
    expect(status?.state).toBe(StatusState.Active);
    expect(status?.activity).toEqual({
      kind: ActivityKind.Claimed,
      params: { claimantId: settler.id },
    });
  });
});
