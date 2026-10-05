import { describe, expect, it } from "vitest";
import { claimPosting } from "../../jobs/jobPostings";
import { noAiOverride } from "../../jobs/testJobWorld";
import { BlockedReasonKind, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { awaitingWorker } from "./awaitingWorker";

describe("awaitingWorker", () => {
  it("returns AwaitingWorker with the posting as cause while the posting is open", () => {
    const world = createStatusWorld();
    const open = world.postFell(33);
    expect(awaitingWorker(world.engine, open.id)).toEqual({
      kind: BlockedReasonKind.AwaitingWorker,
      params: { postingId: open.id },
      causeRef: { kind: StatusSubjectKind.JobPosting, id: open.id },
    });
  });

  it("returns null without a posting, for an unknown one and once it is claimed", () => {
    const world = createStatusWorld();
    const settler = world.spawn("peasant", 55, noAiOverride);
    const open = world.postFell(33);
    expect(awaitingWorker(world.engine, null)).toBeNull();
    expect(awaitingWorker(world.engine, 999)).toBeNull();
    claimPosting(world.engine, open.id, settler.id, world.engine.time.tickCount);
    expect(awaitingWorker(world.engine, open.id)).toBeNull();
  });
});
