import { describe, expect, it } from "vitest";
import { queueBoardUpdate } from "../../crier/boardUpdates";
import { BoardChangeKind, UpdateOrigin } from "../../crier/crierTypes";
import { pauseBoard } from "../../jobs/boardPause";
import { requireBoard } from "../../jobs/jobBoards";
import { JobBoardMode, PauseSource } from "../../jobs/jobTypes";
import { createStatusContext } from "../statusContext";
import { evaluateSubject, explain } from "../explain";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { boardProvider } from "./boardProvider";

// @covers 017:FR-019
describe("boardProvider", () => {
  it("lists the boards and is Active while nothing paused them", () => {
    const world = createStatusWorld();
    const ref = { kind: StatusSubjectKind.JobBoard, id: world.boardId };
    expect(boardProvider.subjects(world.engine)).toEqual([ref]);
    expect(evaluateSubject(world.engine, ref)?.state).toBe(StatusState.Active);
    expect(
      boardProvider.evaluate(
        world.engine,
        { kind: StatusSubjectKind.JobBoard, id: 999 },
        createStatusContext(world.engine),
      ),
    ).toBeNull();
  });

  it("reports a player pause as Paused", () => {
    const world = createStatusWorld();
    pauseBoard(world.engine, world.boardId, PauseSource.Player);
    const ref = { kind: StatusSubjectKind.JobBoard, id: world.boardId };
    const status = evaluateSubject(world.engine, ref);
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons[0]).toEqual({
      kind: BlockedReasonKind.Paused,
      params: { jobBoardId: world.boardId },
      causeRef: null,
    });
  });

  it("reports a system pause inside a zone as ZoneInactive with the zone as cause", () => {
    const world = createStatusWorld({ boardCell: 22 });
    const cells = world.rect(2, 2, 2, 2);
    const [zoneId] = world.designate("bakery", cells);
    world.run(2);
    pauseBoard(world.engine, world.boardId, PauseSource.System);
    const explanation = explain(world.engine, {
      kind: StatusSubjectKind.JobBoard,
      id: world.boardId,
    });
    expect(explanation?.reasons[0]).toEqual({
      kind: BlockedReasonKind.ZoneInactive,
      params: { zoneId: zoneId ?? 0 },
      causeRef: { kind: StatusSubjectKind.Zone, id: zoneId ?? 0 },
    });
    expect(explanation?.chain[1]?.subject).toEqual({
      kind: StatusSubjectKind.Zone,
      id: zoneId ?? 0,
    });
  });

  it("reports a change that waits for a Town Crier as AwaitingTownCrier", () => {
    const world = createStatusWorld();
    requireBoard(world.engine, world.boardId).data.mode = JobBoardMode.UserManaged;
    queueBoardUpdate(
      world.engine,
      world.boardId,
      {
        kind: BoardChangeKind.Add,
        jobTypeId: "fell.trees",
        mapId: world.mapId,
        cellIndex: 15,
        entityId: null,
        materialId: null,
        priority: null,
        urgent: false,
        wage: null,
      },
      UpdateOrigin.Player,
    );
    const status = evaluateSubject(world.engine, {
      kind: StatusSubjectKind.JobBoard,
      id: world.boardId,
    });
    expect(status?.state).toBe(StatusState.Blocked);
    expect(status?.reasons).toEqual([
      {
        kind: BlockedReasonKind.AwaitingTownCrier,
        params: { jobBoardId: world.boardId },
        causeRef: null,
      },
    ]);
  });
});
