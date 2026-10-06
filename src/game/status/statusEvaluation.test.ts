import { describe, expect, it } from "vitest";
import { makeReason } from "./reasons";
import { listSubjects, runStatusPass } from "./statusEvaluation";
import { BlockedReasonKind, statusGraceTicks, StatusState, StatusSubjectKind } from "./statusTypes";
import type { SubjectStatus } from "./statusTypes";
import { createStatusWorld } from "./testStatusWorld";

const stalled: SubjectStatus = {
  state: StatusState.Blocked,
  activity: null,
  reasons: [makeReason(BlockedReasonKind.MissingInput, { materialId: "flour" })],
};
const fine: SubjectStatus = { state: StatusState.Active, activity: null, reasons: [] };

describe("listSubjects", () => {
  // @covers 025:FR-008
  it("visits providers in registration order and the subjects of each in its own order", () => {
    const world = createStatusWorld();
    const settler = world.settler(11);
    const oven = world.station("oven", 22);
    world.setSynthetic(7, fine);
    world.setSynthetic(3, fine);
    const refs = listSubjects(world.engine);
    const kinds = refs.map((ref) => ref.kind);
    expect(kinds.indexOf(StatusSubjectKind.Citizen)).toBeLessThan(
      kinds.indexOf(StatusSubjectKind.Workstation),
    );
    expect(refs).toContainEqual({ kind: StatusSubjectKind.Citizen, id: settler.id });
    expect(refs).toContainEqual({ kind: StatusSubjectKind.Workstation, id: oven.id });
    expect(
      refs.filter((ref) => ref.kind === StatusSubjectKind.StandingOrder).map((ref) => ref.id),
    ).toEqual([7, 3]);
  });
});

describe("runStatusPass", () => {
  // @covers 025:FR-007 025:SC-001
  it("emits status.blocked once the stall has held the grace period, sinceTick = its first tick", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, stalled);
    world.run(statusGraceTicks);
    expect(world.statusEvents.filter((event) => event.name === "status.blocked")).toEqual([]);
    world.run(1);
    const events = world.statusEvents.filter((event) => event.name === "status.blocked");
    expect(events).toHaveLength(1);
    const payload = events[0]?.payload;
    expect(payload).toMatchObject({
      subject: { kind: StatusSubjectKind.StandingOrder, id: 1 },
      state: StatusState.Blocked,
      previousReason: null,
      sinceTick: 1,
    });
    world.run(30);
    expect(world.statusEvents.filter((event) => event.name === "status.blocked")).toHaveLength(1);
  });

  it("emits nothing when the stall ends before the grace period", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, stalled);
    world.run(statusGraceTicks - 2);
    world.setSynthetic(1, fine);
    world.run(40);
    expect(world.statusEvents).toEqual([]);
  });

  // @covers 025:FR-007
  it("emits status.unblocked with the stalled ticks and status.unblocked removed when it vanishes", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, stalled);
    world.setSynthetic(2, stalled);
    world.run(statusGraceTicks + 3);
    world.setSynthetic(1, fine);
    world.removeSynthetic(2);
    world.run(1);
    const unblocked = world.statusEvents.filter((event) => event.name === "status.unblocked");
    expect(unblocked).toHaveLength(2);
    expect(unblocked[0]?.payload).toMatchObject({
      subject: { kind: StatusSubjectKind.StandingOrder, id: 1 },
      removed: false,
    });
    expect(unblocked[1]?.payload).toMatchObject({
      subject: { kind: StatusSubjectKind.StandingOrder, id: 2 },
      removed: true,
    });
    const stalledTicks = (unblocked[0]?.payload as { stalledTicks: number }).stalledTicks;
    expect(stalledTicks).toBeGreaterThanOrEqual(statusGraceTicks + 3);
  });

  it("returns how many events it emitted", () => {
    const world = createStatusWorld();
    world.setSynthetic(1, {
      state: StatusState.Blocked,
      activity: null,
      reasons: [makeReason(BlockedReasonKind.Paused)],
    });
    expect(runStatusPass(world.engine, world.engine.time.tickCount + 1)).toBe(1);
    expect(runStatusPass(world.engine, world.engine.time.tickCount + 2)).toBe(0);
  });
});
