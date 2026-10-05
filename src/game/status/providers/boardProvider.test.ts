import { describe, expect, it } from "vitest";
import { pauseBoard } from "../../jobs/boardPause";
import { PauseSource } from "../../jobs/jobTypes";
import { createStatusContext } from "../statusContext";
import { evaluateSubject, explain } from "../explain";
import { BlockedReasonKind, StatusState, StatusSubjectKind } from "../statusTypes";
import { createStatusWorld } from "../testStatusWorld";
import { boardProvider } from "./boardProvider";

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
});
