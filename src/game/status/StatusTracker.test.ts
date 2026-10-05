import { describe, expect, it } from "vitest";
import { makeReason } from "./reasons";
import { StatusTracker } from "./StatusTracker";
import { BlockedReasonKind, statusGraceTicks, StatusState, StatusSubjectKind } from "./statusTypes";
import type { SubjectStatus } from "./statusTypes";

const subject = { kind: StatusSubjectKind.Workstation, id: 7 };

const active: SubjectStatus = { state: StatusState.Active, activity: null, reasons: [] };

function blocked(materialId: string): SubjectStatus {
  return {
    state: StatusState.Blocked,
    activity: null,
    reasons: [
      makeReason(BlockedReasonKind.MissingInput, { materialId, required: 1, available: 0 }),
    ],
  };
}

const paused: SubjectStatus = {
  state: StatusState.Blocked,
  activity: null,
  reasons: [makeReason(BlockedReasonKind.Paused, { productionOrderId: 1 })],
};

describe("StatusTracker.observe", () => {
  it("publishes nothing for an Active subject", () => {
    const tracker = new StatusTracker();
    expect(tracker.observe(subject, active, 5)).toEqual({ blocked: null, unblocked: null });
    expect(tracker.get(subject)?.state).toBe(StatusState.Active);
  });

  it("holds a stall for the grace period: no event at grace-1, one at grace with sinceTick = first tick", () => {
    const tracker = new StatusTracker();
    const start = 100;
    for (let tick = start; tick < start + statusGraceTicks; tick += 1) {
      expect(tracker.observe(subject, blocked("flour"), tick).blocked).toBeNull();
    }
    const published = tracker.observe(subject, blocked("flour"), start + statusGraceTicks).blocked;
    expect(published).not.toBeNull();
    expect(published?.sinceTick).toBe(start);
    expect(published?.previousReason).toBeNull();
    expect(published?.state).toBe(StatusState.Blocked);
    expect(published?.reason.kind).toBe(BlockedReasonKind.MissingInput);
    expect(
      tracker.observe(subject, blocked("flour"), start + statusGraceTicks + 1).blocked,
    ).toBeNull();
    expect(tracker.get(subject)?.sinceTick).toBe(start);
  });

  it("emits nothing when the reason clears before the grace period ends", () => {
    const tracker = new StatusTracker();
    for (let tick = 0; tick < statusGraceTicks - 1; tick += 1) {
      tracker.observe(subject, blocked("flour"), tick);
    }
    expect(tracker.observe(subject, active, statusGraceTicks - 1)).toEqual({
      blocked: null,
      unblocked: null,
    });
    expect(tracker.get(subject)?.stallStart).toBeNull();
    expect(tracker.get(subject)?.pendingKey).toBeNull();
  });

  it("publishes an immediate kind at once", () => {
    const tracker = new StatusTracker();
    const published = tracker.observe(subject, paused, 40).blocked;
    expect(published?.reason.kind).toBe(BlockedReasonKind.Paused);
    expect(published?.sinceTick).toBe(40);
  });

  it("re-emits on a settled primary change with the previous reason and an unchanged sinceTick", () => {
    const tracker = new StatusTracker();
    for (let tick = 0; tick <= statusGraceTicks; tick += 1) {
      tracker.observe(subject, blocked("flour"), tick);
    }
    const changeAt = statusGraceTicks + 5;
    for (let tick = changeAt; tick < changeAt + statusGraceTicks; tick += 1) {
      expect(tracker.observe(subject, blocked("water"), tick).blocked).toBeNull();
    }
    expect(tracker.get(subject)?.reason?.params["materialId"]).toBe("flour");
    const published = tracker.observe(
      subject,
      blocked("water"),
      changeAt + statusGraceTicks,
    ).blocked;
    expect(published?.previousReason?.params["materialId"]).toBe("flour");
    expect(published?.reason.params["materialId"]).toBe("water");
    expect(published?.sinceTick).toBe(0);
    expect(tracker.get(subject)?.reasonSinceTick).toBe(changeAt);
  });

  it("restarts the grace timer when the pending primary flaps, keeping the published reason", () => {
    const tracker = new StatusTracker();
    for (let tick = 0; tick <= statusGraceTicks; tick += 1) {
      tracker.observe(subject, blocked("flour"), tick);
    }
    const start = 50;
    for (let tick = start; tick < start + 8; tick += 1) {
      tracker.observe(subject, blocked("water"), tick);
    }
    for (let tick = start + 8; tick < start + 16; tick += 1) {
      expect(tracker.observe(subject, blocked("salt"), tick).blocked).toBeNull();
    }
    expect(tracker.get(subject)?.reason?.params["materialId"]).toBe("flour");
    expect(tracker.get(subject)?.pendingSince).toBe(start + 8);
  });

  it("drops the pending change when the published reason returns", () => {
    const tracker = new StatusTracker();
    for (let tick = 0; tick <= statusGraceTicks; tick += 1) {
      tracker.observe(subject, blocked("flour"), tick);
    }
    tracker.observe(subject, blocked("water"), 30);
    expect(tracker.get(subject)?.pendingKey).not.toBeNull();
    tracker.observe(subject, blocked("flour"), 31);
    expect(tracker.get(subject)?.pendingKey).toBeNull();
  });

  it("reports unblocked at once with the stalled ticks and the previous reason", () => {
    const tracker = new StatusTracker();
    for (let tick = 10; tick <= 10 + statusGraceTicks; tick += 1) {
      tracker.observe(subject, blocked("flour"), tick);
    }
    const transition = tracker.observe(subject, active, 60);
    expect(transition.unblocked).toEqual({
      subject,
      previousReason: expect.objectContaining({ kind: BlockedReasonKind.MissingInput }),
      stalledTicks: 50,
      removed: false,
    });
    expect(tracker.get(subject)?.state).toBe(StatusState.Active);
    expect(tracker.get(subject)?.sinceTick).toBe(60);
  });

  it("moves between Idle and Blocked as a state change", () => {
    const tracker = new StatusTracker();
    tracker.observe(subject, paused, 0);
    const idle: SubjectStatus = {
      state: StatusState.Idle,
      activity: null,
      reasons: [makeReason(BlockedReasonKind.NoOrders)],
    };
    const published = tracker.observe(subject, idle, 1).blocked;
    expect(published?.state).toBe(StatusState.Idle);
    expect(published?.previousReason?.kind).toBe(BlockedReasonKind.Paused);
    expect(published?.sinceTick).toBe(0);
  });
});

describe("StatusTracker.retainOnly", () => {
  it("drops vanished subjects and reports removed for the published stalls", () => {
    const tracker = new StatusTracker();
    const other = { kind: StatusSubjectKind.Workstation, id: 8 };
    tracker.observe(subject, paused, 0);
    tracker.observe(other, active, 0);
    const events = tracker.retainOnly(new Set(), 9);
    expect(events).toEqual([
      {
        subject,
        previousReason: expect.objectContaining({ kind: BlockedReasonKind.Paused }),
        stalledTicks: 9,
        removed: true,
      },
    ]);
    expect(tracker.records()).toEqual([]);
  });

  it("keeps live subjects", () => {
    const tracker = new StatusTracker();
    tracker.observe(subject, paused, 0);
    expect(tracker.retainOnly(new Set(["Workstation#7"]), 5)).toEqual([]);
    expect(tracker.get(subject)).not.toBeNull();
  });
});

describe("StatusTracker.purgeOrphans", () => {
  it("drops records silently and counts them", () => {
    const tracker = new StatusTracker();
    tracker.observe(subject, paused, 0);
    expect(tracker.purgeOrphans(new Set())).toBe(1);
    expect(tracker.get(subject)).toBeNull();
  });
});

describe("StatusTracker.get and records", () => {
  it("return copies that do not write through", () => {
    const tracker = new StatusTracker();
    tracker.observe(subject, paused, 0);
    const copy = tracker.get(subject);
    if (copy !== null) {
      copy.sinceTick = 999;
      copy.reason = null;
    }
    expect(tracker.get(subject)?.sinceTick).toBe(0);
    expect(tracker.records()).toHaveLength(1);
    expect(tracker.get({ kind: StatusSubjectKind.Zone, id: 1 })).toBeNull();
  });
});

describe("StatusTracker.createSection", () => {
  it("round-trips the records, including a pending change", () => {
    const tracker = new StatusTracker();
    for (let tick = 0; tick <= statusGraceTicks; tick += 1) {
      tracker.observe(subject, blocked("flour"), tick);
    }
    tracker.observe(subject, blocked("water"), 20);
    const section = tracker.createSection();
    const saved = JSON.parse(JSON.stringify(section.serialize()));
    const restored = new StatusTracker();
    restored.createSection().restore(saved);
    expect(restored.records()).toEqual(tracker.records());
    expect(section.key).toBe("statuses");
    expect(section.defaultForOlderSaves?.()).toEqual({ records: [] });
  });

  it("rejects malformed saved data", () => {
    const section = new StatusTracker().createSection();
    expect(() => section.restore({ records: [{ subject: { kind: "Nope", id: 1 } }] })).toThrow();
  });
});
