import { describe, expect, it } from "vitest";
import { satisfyTaskData } from "../../ai/tasks/satisfyTask";
import { AiTaskType } from "../../ai/aiTypes";
import { NeedPlanKind } from "../../ai/decision/needPlanTypes";
import { pauseBoard } from "../../jobs/boardPause";
import { defaultEligibility } from "../../jobs/eligibility";
import { EligibilityKind, PauseSource, visitTaskType } from "../../jobs/jobTypes";
import { visitTaskData } from "../../jobs/jobVisitTask";
import { noAiOverride } from "../../jobs/testJobWorld";
import { createStatusContext } from "../statusContext";
import { evaluateSubject } from "../explain";
import { ActivityKind, BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { citizenProvider } from "./citizenProvider";

const citizen = (id: number) => ({ kind: StatusSubjectKind.Citizen, id });

// @covers 017:FR-019
describe("citizenProvider", () => {
  it("lists citizens only, in entity order", () => {
    const world = createStatusWorld();
    const first = world.spawn("peasant", 11, noAiOverride);
    world.station("oven", 22);
    const second = world.spawn("peasant", 12, noAiOverride);
    expect(citizenProvider.subjects(world.engine)).toEqual([citizen(first.id), citizen(second.id)]);
  });

  it("returns null for a missing or non-citizen entity", () => {
    const world = createStatusWorld();
    const oven = world.station("oven", 22);
    const context = createStatusContext(world.engine);
    expect(citizenProvider.evaluate(world.engine, citizen(999), context)).toBeNull();
    expect(citizenProvider.evaluate(world.engine, citizen(oven.id), context)).toBeNull();
  });

  // @covers 025:FR-002
  it("is Idle without a task and no job on the board: NoJobsAvailable", () => {
    const world = createStatusWorld();
    const settler = world.spawn("peasant", 55, noAiOverride);
    const status = evaluateSubject(world.engine, citizen(settler.id));
    expect(status?.state).toBe(StatusState.Idle);
    expect(status?.reasons).toEqual([
      {
        kind: BlockedReasonKind.NoJobsAvailable,
        params: { jobBoardId: world.boardId },
        causeRef: null,
      },
    ]);
  });

  it("reports NoReachableJobBoard when walls cut the citizen off from every board", () => {
    const world = createStatusWorld();
    const map = world.engine.maps.require(world.mapId);
    for (const cell of [1, 10, 11]) {
      map.setTerrain(cell, "rock_wall");
    }
    const settler = world.spawn("peasant", 55, noAiOverride);
    expect(evaluateSubject(world.engine, citizen(settler.id))?.reasons[0]?.kind).toBe(
      BlockedReasonKind.NoReachableJobBoard,
    );
  });

  it("reports Paused with the board as cause when every reachable board is paused", () => {
    const world = createStatusWorld();
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    const settler = world.spawn("peasant", 55, noAiOverride);
    expect(evaluateSubject(world.engine, citizen(settler.id))?.reasons[0]).toEqual({
      kind: BlockedReasonKind.Paused,
      params: { jobBoardId: world.boardId },
      causeRef: { kind: StatusSubjectKind.JobBoard, id: world.boardId },
    });
  });

  it("reports AwaitingDecision while a claimable posting waits and the citizen has not walked yet", () => {
    const world = createStatusWorld();
    const settler = world.spawn("peasant", 55, noAiOverride);
    world.postFell(33);
    expect(evaluateSubject(world.engine, citizen(settler.id))?.reasons[0]).toEqual({
      kind: BlockedReasonKind.AwaitingDecision,
      params: { boardId: world.boardId },
      causeRef: null,
    });
  });

  it("reports NoQualifiedWorker with the skill when every posting asks for more than the citizen has", () => {
    const world = createStatusWorld();
    const settler = world.spawn("peasant", 55, noAiOverride);
    world.postFell(33, {
      eligibility: [
        ...defaultEligibility(),
        { kind: EligibilityKind.MinSkill, skillId: "woodcutting", level: 90 },
      ],
    });
    expect(evaluateSubject(world.engine, citizen(settler.id))?.reasons[0]).toEqual({
      kind: BlockedReasonKind.NoQualifiedWorker,
      params: { skillId: "woodcutting", requiredLevel: 90 },
      causeRef: null,
    });
  });

  it("reports Unreachable with the target when the only posting cannot be walked to", () => {
    const world = createStatusWorld();
    const map = world.engine.maps.require(world.mapId);
    for (const cell of [98, 89, 88]) {
      map.setTerrain(cell, "rock_wall");
    }
    const settler = world.spawn("peasant", 55, noAiOverride);
    world.postFell(99);
    expect(evaluateSubject(world.engine, citizen(settler.id))?.reasons[0]).toEqual({
      kind: BlockedReasonKind.Unreachable,
      params: { entityId: 0 },
      causeRef: null,
    });
  });

  it("is Active with an activity for eating, sleeping and walking to a board", () => {
    const world = createStatusWorld();
    const settler = world.spawn("peasant", 55, noAiOverride);
    const plan = {
      kind: NeedPlanKind.Consume,
      needId: "hunger",
      sourceId: settler.id,
      materialId: "bread",
      mapId: world.mapId,
      cellIndex: 55,
      amountMilli: 1000,
    };
    const id = world.engine.tasks.enqueue(settler.id, {
      type: AiTaskType.Satisfy,
      data: satisfyTaskData(plan),
      priority: 100,
    });
    const eating = evaluateSubject(world.engine, citizen(settler.id));
    expect(eating?.state).toBe(StatusState.Active);
    expect(eating?.activity).toEqual({
      kind: ActivityKind.Eating,
      params: { needId: "hunger", materialId: "bread" },
    });
    expect(id).toBeGreaterThan(0);
    const sleeper = world.spawn("peasant", 56, noAiOverride);
    world.engine.tasks.enqueue(sleeper.id, {
      type: AiTaskType.Satisfy,
      data: satisfyTaskData({
        ...plan,
        kind: NeedPlanKind.Sleep,
        needId: "rest",
        materialId: null,
      }),
      priority: 100,
    });
    expect(evaluateSubject(world.engine, citizen(sleeper.id))?.activity).toEqual({
      kind: ActivityKind.Sleeping,
      params: { needId: "rest" },
    });
    const walker = world.spawn("peasant", 57, noAiOverride);
    world.engine.tasks.enqueue(walker.id, {
      type: visitTaskType,
      data: visitTaskData(world.boardId),
      priority: 50,
    });
    expect(evaluateSubject(world.engine, citizen(walker.id))?.activity).toEqual({
      kind: ActivityKind.WalkingToBoard,
      params: { boardId: world.boardId },
    });
  });

  it("is Active and Working once the citizen has claimed a posting", () => {
    const world = createStatusWorld();
    const settler = world.settler(11);
    world.feed([settler]);
    const posting = world.postFell(33);
    let status = evaluateSubject(world.engine, citizen(settler.id));
    for (let tick = 0; tick < 400 && status?.activity?.kind !== ActivityKind.Working; tick += 1) {
      world.run(1);
      world.feed([settler]);
      status = evaluateSubject(world.engine, citizen(settler.id));
    }
    expect(status?.state).toBe(StatusState.Active);
    expect(status?.activity).toEqual({
      kind: ActivityKind.Working,
      params: { jobTypeId: "fell.trees", postingId: posting.id },
    });
  });
});
