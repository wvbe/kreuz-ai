import { describe, expect, it } from "vitest";
import { buildIdleBlockedView } from "./idleBlocked";
import { makeReason } from "./reasons";
import { BlockedReasonKind, statusGraceTicks, StatusState, StatusSubjectKind } from "./statusTypes";
import type { SubjectStatus } from "./statusTypes";
import { createStatusWorld } from "./testStatusWorld";

const stalled = (materialId: string): SubjectStatus => ({
  state: StatusState.Blocked,
  activity: null,
  reasons: [makeReason(BlockedReasonKind.MissingInput, { materialId })],
});

describe("buildIdleBlockedView", () => {
  it("lists only settled subjects by default and the settling ones on request", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, stalled("flour"));
    world.run(3);
    expect(buildIdleBlockedView(world.engine)).toEqual([]);
    const unsettled = buildIdleBlockedView(world.engine, { includeUnsettled: true });
    expect(unsettled).toHaveLength(1);
    expect(unsettled[0]).toMatchObject({ settled: false, sinceTick: 1 });
    world.run(statusGraceTicks);
    const settled = buildIdleBlockedView(world.engine);
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({
      subject: { kind: StatusSubjectKind.StandingOrder, id: 1 },
      state: StatusState.Blocked,
      settled: true,
      sinceTick: 1,
    });
    expect(settled[0]?.reasons[0]?.kind).toBe(BlockedReasonKind.MissingInput);
  });

  // @covers 025:FR-017
  it("sorts by sinceTick ascending, then kind and id, and filters by state and kind", () => {
    const world = createStatusWorld();
    world.setSynthetic(5, stalled("a"));
    world.run(4);
    world.setSynthetic(2, {
      state: StatusState.Idle,
      activity: null,
      reasons: [makeReason(BlockedReasonKind.NoOrders)],
    });
    world.setSynthetic(1, stalled("b"));
    world.run(statusGraceTicks + 2);
    const rows = buildIdleBlockedView(world.engine);
    expect(rows.map((row) => row.subject.id)).toEqual([5, 1, 2]);
    expect(rows.map((row) => row.sinceTick)).toEqual(
      [...rows.map((row) => row.sinceTick)].sort((first, second) => first - second),
    );
    expect(
      buildIdleBlockedView(world.engine, { state: StatusState.Idle }).map((row) => row.subject.id),
    ).toEqual([2]);
    expect(buildIdleBlockedView(world.engine, { kind: StatusSubjectKind.Citizen })).toEqual([]);
  });

  it("keeps the stall start while the primary reason changes and drops a subject that recovers", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, stalled("flour"));
    world.run(statusGraceTicks + 1);
    world.setSynthetic(1, stalled("water"));
    world.run(2);
    const [row] = buildIdleBlockedView(world.engine);
    expect(row).toMatchObject({ settled: true, sinceTick: 1 });
    expect(row?.reasons[0]?.params["materialId"]).toBe("water");
    world.setSynthetic(1, { state: StatusState.Active, activity: null, reasons: [] });
    expect(buildIdleBlockedView(world.engine, { includeUnsettled: true })).toEqual([]);
  });

  it("shows an idle citizen with its reason after the grace period", () => {
    const world = createStatusWorld();
    const settler = world.settler(11);
    world.feed([settler]);
    world.run(statusGraceTicks * 3);
    const rows = buildIdleBlockedView(world.engine, { kind: StatusSubjectKind.Citizen });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe(StatusState.Idle);
    expect(rows[0]?.reasons[0]?.kind).toBe(BlockedReasonKind.NoJobsAvailable);
    expect(rows[0]?.reasons[0]?.params).toEqual({ jobBoardId: world.boardId });
  });
});
