import { describe, expect, it } from "vitest";
import type { EventRecord } from "../../../game/api/CommandResult";
import type { JsonValue } from "../../../game/engine/EventBus";
import { ToastKind, ToastStore } from "../engine/ToastStore";
import { defaultRendererPrefs } from "../prefs/rendererPrefs";
import type { RendererPrefs } from "../prefs/rendererPrefs";
import { NotificationCenter } from "./NotificationCenter";

type Harness = {
  toasts: ToastStore;
  center: NotificationCenter;
  calls: string[];
  send: (name: string, payload: JsonValue, tick?: number) => void;
  click: (index: number) => void;
};

function harness(prefs: Partial<RendererPrefs> = {}): Harness {
  const toasts = new ToastStore();
  const calls: string[] = [];
  let seq = 0;
  const center = new NotificationCenter({
    toasts,
    getPrefs: () => ({ ...defaultRendererPrefs, ...prefs }),
    actions: {
      focusEntity: (entityId) => {
        calls.push(`entity:${entityId}`);
        return true;
      },
      focusSubject: (subject) => {
        calls.push(`subject:${subject.kind}#${subject.id}`);
        return true;
      },
      openChronicle: () => calls.push("chronicle"),
      openCitizenJournal: (entityId) => calls.push(`journal:${entityId}`),
      openProgress: () => calls.push("progress"),
      openIdleBlocked: () => calls.push("idle"),
      momentText: (tick, momentId) => (momentId === 7 ? `Rendered moment at ${tick}` : null),
    },
  });
  return {
    toasts,
    center,
    calls,
    send: (name, payload, tick = 100) => {
      seq += 1;
      const record: EventRecord = { seq, tick, name, payload };
      center.handle(record);
    },
    click: (index) => toasts.getSnapshot().toasts[index]?.onActivate?.(),
  };
}

function texts(toasts: ToastStore): string[] {
  return toasts.getSnapshot().toasts.map((toast) => toast.text);
}

function moment(momentId: number, kind: string, prominence: string, entityId: number | null) {
  return {
    momentId,
    tick: 100,
    kind,
    prominence,
    entityId,
    nameSnapshot: entityId === null ? null : "Edda",
    params: {},
  };
}

describe("NotificationCenter", () => {
  it("toasts tier and milestone events and opens the progress panel or the subject", () => {
    const { toasts, send, click, calls } = harness();
    send("settlement.tier.reached", { tier: "market_town", previousTier: "village", tick: 100 });
    send("settlement.milestone.reached", {
      milestone: "first-market",
      tick: 100,
      subjectIds: [12],
    });
    send("settlement.milestone.reached", {
      milestone: "first-guild-founded",
      tick: 100,
      subjectIds: [],
    });
    expect(texts(toasts)).toEqual([
      "Hear ye! The settlement hath risen to a Market town.",
      "Huzzah! A milestone is met: First market.",
      "Huzzah! A milestone is met: First guild founded.",
    ]);
    click(0);
    click(1);
    click(2);
    expect(calls).toEqual(["progress", "entity:12", "progress"]);
  });

  it("notifies Major moments only, with the rendered text, and links to the citizen", () => {
    const { toasts, send, click, calls } = harness();
    send("chronicle.moment.recorded", moment(1, "arrived", "minor", 3));
    send("chronicle.moment.recorded", moment(2, "tier_reached", "major", null));
    send("chronicle.moment.recorded", moment(7, "took_office", "major", 3));
    send("chronicle.moment.recorded", moment(8, "died", "major", 4));
    send("chronicle.moment.recorded", moment(9, "settlement_milestone", "major", null));
    expect(texts(toasts)).toEqual(["Rendered moment at 100", "Edda: Died."]);
    click(0);
    expect(calls).toEqual(["journal:3"]);
  });

  it("folds tidings beyond the burst limit within a game hour into 'N more tidings'", () => {
    const { toasts, send, click, calls } = harness({ toastBurstLimit: 2 });
    for (let index = 0; index < 5; index += 1) {
      send("housing.immigrant.arrived", {
        entityId: 20 + index,
        prototypeId: "settler",
        dwellingId: 1,
      });
    }
    expect(texts(toasts)).toEqual([
      "A new settler hath arrived.",
      "A new settler hath arrived.",
      "3 more tidings",
    ]);
    click(2);
    expect(calls).toEqual(["chronicle"]);
    send("housing.immigrant.arrived", { entityId: 40, prototypeId: "settler", dwellingId: 1 }, 112);
    expect(texts(toasts)).toHaveLength(4);
  });

  it("covers housing and steward events with kinds and subjects", () => {
    const { toasts, send, click, calls } = harness({ toastBurstLimit: 10 });
    send("housing.dwelling.at-risk", { dwellingId: 5, level: "hovel", unmetRequirements: [] });
    send("housing.dwelling.upgraded", { dwellingId: 5, fromLevel: "hovel", toLevel: "cottage" });
    send("housing.dwelling.downgraded", { dwellingId: 6, fromLevel: "cottage", toLevel: "hovel" });
    send("steward.appointed", { entityId: 9 });
    expect(toasts.getSnapshot().toasts.map((toast) => toast.kind)).toEqual([
      ToastKind.Warning,
      ToastKind.Info,
      ToastKind.Warning,
      ToastKind.Info,
    ]);
    for (let index = 0; index < 4; index += 1) {
      click(index);
    }
    expect(calls).toEqual([
      "subject:Dwelling#5",
      "subject:Dwelling#5",
      "subject:Dwelling#6",
      "entity:9",
    ]);
  });

  it("groups status.blocked per reason kind, counts up, limits groups and honours mutes", () => {
    const blocked = (kind: string, id: number, state = "Blocked") => ({
      subject: { kind: "Workstation", id },
      state,
      reason: { kind, params: {}, causeRef: null },
      previousReason: null,
      sinceTick: 90,
    });
    const { toasts, send, click, calls } = harness({
      toastBurstLimit: 2,
      mutedBlockedReasons: ["NoOrders"],
    });
    send("status.blocked", blocked("MissingInput", 11));
    send("status.blocked", blocked("MissingInput", 12));
    send("status.blocked", blocked("NoOrders", 13));
    send("status.blocked", blocked("MissingTool", 14));
    send("status.blocked", blocked("OutputBlocked", 15));
    send("status.blocked", blocked("NoJobsAvailable", 16, "Idle"));
    expect(texts(toasts)).toEqual([
      "2 things are stuck: missing input.",
      "1 thing is stuck: missing tool.",
    ]);
    click(0);
    expect(calls).toEqual(["subject:Workstation#11"]);
    send("status.blocked", blocked("OutputBlocked", 15), 112);
    expect(texts(toasts)).toHaveLength(3);
  });

  it("ignores unknown events and non-object payloads, and falls back when a subject is gone", () => {
    const { toasts, send, calls, center } = harness();
    send("other.thing", { value: 1 });
    send("settlement.tier.reached", 5);
    expect(toasts.getSnapshot().toasts).toHaveLength(0);
    send("status.blocked", {
      subject: { kind: "Workstation", id: 1 },
      state: "Blocked",
      reason: { kind: "Unreachable", params: {}, causeRef: null },
    });
    expect(center).toBeDefined();
    const fresh = harness();
    fresh.send("status.blocked", { state: "Blocked", reason: { kind: "Unreachable" } });
    fresh.click(0);
    expect(fresh.calls).toEqual(["idle"]);
    expect(calls).toEqual([]);
  });
});
