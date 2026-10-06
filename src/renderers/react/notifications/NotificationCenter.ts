import type { EventRecord } from "../../../game/api/CommandResult";
import type { JsonValue } from "../../../game/engine/EventBus";
import type { RendererPrefs } from "../prefs/rendererPrefs";
import { ToastKind } from "../engine/ToastStore";
import type { ToastStore } from "../engine/ToastStore";
import { blockedReasonTitle, humanizeId } from "../views/blockedReasonText";

/**
 * Game ticks in one game hour; the burst limit counts per hour (spec 024 FR-040).
 */
const ticksPerGameHour = 12;
/**
 * How long a toast stays: half a game day.
 */
const toastLifeTicks = 144;
/**
 * Moment kinds that already have their own toast (tier and milestone notifications).
 */
const kindsWithOwnToast: readonly string[] = ["tier_reached", "settlement_milestone"];

/**
 * What a toast does when clicked, supplied by the bridge so the center stays free of React.
 */
export type NotificationActions = {
  /**
   * Selects a citizen or other entity and centres the camera; false when it is not on a map.
   */
  focusEntity: (entityId: number) => boolean;
  /**
   * Selects a status subject and centres the camera; false when it has no place.
   */
  focusSubject: (subject: { kind: string; id: number }) => boolean;
  openChronicle: () => void;
  openCitizenJournal: (entityId: number) => void;
  openProgress: () => void;
  openIdleBlocked: () => void;
  /**
   * The rendered text of a recorded moment (the `moments-since` query), or null.
   */
  momentText: (tick: number, momentId: number) => string | null;
};

/**
 * What the center needs from the host.
 */
export type NotificationDeps = {
  toasts: ToastStore;
  getPrefs: () => RendererPrefs;
  actions: NotificationActions;
};

type Fields = { readonly [name: string]: JsonValue };

function fieldsOf(payload: JsonValue): Fields | null {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload
    : null;
}

function numberField(fields: Fields, name: string): number | null {
  const value = fields[name];
  return typeof value === "number" ? value : null;
}

function stringField(fields: Fields, name: string): string | null {
  const value = fields[name];
  return typeof value === "string" ? value : null;
}

function capitalised(id: string): string {
  const words = humanizeId(id);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type BlockedBucket = { toastId: number; count: number };

/**
 * Turns engine events into toasts (spec 024 FR-028, FR-036, FR-040), in the flavour style the
 * spec asks for:
 *
 * - `settlement.tier.reached` and `settlement.milestone.reached` always get a toast.
 * - Major `chronicle.moment.recorded`, housing (`at-risk`, `upgraded`, `downgraded`,
 *   `immigrant.arrived`) and `steward.appointed` are tidings: at most `toastBurstLimit` per game
 *   hour show, the rest fold into one "N more tidings" toast linking to the chronicle. Minor
 *   moments are never notified.
 * - `status.blocked` (state Blocked only) is grouped per reason kind and game hour into one toast
 *   that counts up; at most `toastBurstLimit` reason groups per hour; reasons the player muted in
 *   the settings are skipped. The Idle and Blocked screen lists what the toasts left out.
 *
 * Every toast that has a subject focuses it when clicked.
 */
export class NotificationCenter {
  private hour = -1;
  private tidings = 0;
  private folded = 0;
  private foldToastId: number | null = null;
  private blockedGroups = 0;
  private readonly blocked = new Map<string, BlockedBucket>();

  /**
   * Creates the center.
   *
   * @param deps - The toast store, the preferences and the click actions.
   */
  constructor(private readonly deps: NotificationDeps) {}

  /**
   * Handles one delivered engine event; events it does not know are ignored.
   *
   * @param record - The event.
   */
  handle(record: EventRecord): void {
    this.enterHour(record.tick);
    const fields = fieldsOf(record.payload);
    if (fields === null) {
      return;
    }
    switch (record.name) {
      case "settlement.tier.reached":
        this.onTier(record, fields);
        break;
      case "settlement.milestone.reached":
        this.onMilestone(record, fields);
        break;
      case "chronicle.moment.recorded":
        this.onMoment(record, fields);
        break;
      case "housing.dwelling.at-risk":
        this.onDwelling(record, fields, ToastKind.Warning, "A dwelling is at risk of decline.");
        break;
      case "housing.dwelling.upgraded":
        this.onDwelling(record, fields, ToastKind.Info, "A dwelling hath been bettered.");
        break;
      case "housing.dwelling.downgraded":
        this.onDwelling(record, fields, ToastKind.Warning, "A dwelling hath fallen into decline.");
        break;
      case "housing.immigrant.arrived":
        this.onEntityTiding(record, fields, "A new settler hath arrived.");
        break;
      case "steward.appointed":
        this.onEntityTiding(record, fields, "A Steward hath been appointed.");
        break;
      case "status.blocked":
        this.onBlocked(record, fields);
        break;
      default:
        break;
    }
  }

  private enterHour(tick: number): void {
    const hour = Math.floor(tick / ticksPerGameHour);
    if (hour !== this.hour) {
      this.hour = hour;
      this.tidings = 0;
      this.folded = 0;
      this.foldToastId = null;
      this.blockedGroups = 0;
      this.blocked.clear();
    }
  }

  private onTier(record: EventRecord, fields: Fields): void {
    const tier = stringField(fields, "tier") ?? "a new tier";
    this.deps.toasts.push(
      ToastKind.Info,
      `Hear ye! The settlement hath risen to a ${capitalised(tier)}.`,
      record.tick + toastLifeTicks * 2,
      () => this.deps.actions.openProgress(),
    );
  }

  private onMilestone(record: EventRecord, fields: Fields): void {
    const milestone = stringField(fields, "milestone") ?? "a milestone";
    const subjects = fields["subjectIds"];
    const first = Array.isArray(subjects) && typeof subjects[0] === "number" ? subjects[0] : null;
    this.deps.toasts.push(
      ToastKind.Info,
      `Huzzah! A milestone is met: ${capitalised(milestone)}.`,
      record.tick + toastLifeTicks * 2,
      () => {
        if (first === null || !this.deps.actions.focusEntity(first)) {
          this.deps.actions.openProgress();
        }
      },
    );
  }

  private onMoment(record: EventRecord, fields: Fields): void {
    const kind = stringField(fields, "kind") ?? "";
    if (stringField(fields, "prominence") !== "major" || kindsWithOwnToast.includes(kind)) {
      return;
    }
    const momentId = numberField(fields, "momentId");
    const entityId = numberField(fields, "entityId");
    const rendered =
      momentId === null
        ? null
        : this.deps.actions.momentText(numberField(fields, "tick") ?? record.tick, momentId);
    const name = stringField(fields, "nameSnapshot");
    const text = rendered ?? `${name === null ? "" : `${name}: `}${capitalised(kind)}.`;
    this.tiding(record.tick, ToastKind.Info, text, () => {
      if (entityId === null) {
        this.deps.actions.openChronicle();
      } else {
        this.deps.actions.openCitizenJournal(entityId);
      }
    });
  }

  private onDwelling(record: EventRecord, fields: Fields, kind: ToastKind, text: string): void {
    const dwellingId = numberField(fields, "dwellingId");
    this.tiding(record.tick, kind, text, () => {
      if (dwellingId !== null) {
        this.deps.actions.focusSubject({ kind: "Dwelling", id: dwellingId });
      }
    });
  }

  private onEntityTiding(record: EventRecord, fields: Fields, text: string): void {
    const entityId = numberField(fields, "entityId");
    this.tiding(record.tick, ToastKind.Info, text, () => {
      if (entityId !== null) {
        this.deps.actions.focusEntity(entityId);
      }
    });
  }

  private tiding(tick: number, kind: ToastKind, text: string, onActivate: () => void): void {
    const limit = this.deps.getPrefs().toastBurstLimit;
    if (this.tidings < limit) {
      this.tidings += 1;
      this.deps.toasts.push(kind, text, tick + toastLifeTicks, onActivate);
      return;
    }
    this.folded += 1;
    const label = `${this.folded} more ${this.folded === 1 ? "tiding" : "tidings"}`;
    const shown = this.deps.toasts
      .getSnapshot()
      .toasts.some((toast) => toast.id === this.foldToastId);
    if (this.foldToastId !== null && shown) {
      this.deps.toasts.update(this.foldToastId, label, tick + toastLifeTicks);
    } else {
      this.foldToastId = this.deps.toasts.push(ToastKind.Info, label, tick + toastLifeTicks, () =>
        this.deps.actions.openChronicle(),
      );
    }
  }

  private onBlocked(record: EventRecord, fields: Fields): void {
    const reason = fieldsOf(fields["reason"] ?? null);
    const kind = reason === null ? null : stringField(reason, "kind");
    if (kind === null || stringField(fields, "state") !== "Blocked") {
      return;
    }
    const prefs = this.deps.getPrefs();
    if (prefs.mutedBlockedReasons.includes(kind)) {
      return;
    }
    const subject = fieldsOf(fields["subject"] ?? null);
    const subjectKind = subject === null ? null : stringField(subject, "kind");
    const subjectId = subject === null ? null : numberField(subject, "id");
    const bucket = this.blocked.get(kind);
    if (bucket !== undefined) {
      bucket.count += 1;
      this.deps.toasts.update(
        bucket.toastId,
        this.blockedText(kind, bucket.count),
        record.tick + toastLifeTicks,
      );
      return;
    }
    if (this.blockedGroups >= prefs.toastBurstLimit) {
      return;
    }
    this.blockedGroups += 1;
    const toastId = this.deps.toasts.push(
      ToastKind.Warning,
      this.blockedText(kind, 1),
      record.tick + toastLifeTicks,
      () => {
        if (
          subjectKind === null ||
          subjectId === null ||
          !this.deps.actions.focusSubject({ kind: subjectKind, id: subjectId })
        ) {
          this.deps.actions.openIdleBlocked();
        }
      },
    );
    this.blocked.set(kind, { toastId, count: 1 });
  }

  private blockedText(kind: string, count: number): string {
    return `${count} ${count === 1 ? "thing is" : "things are"} stuck: ${blockedReasonTitle(kind).toLowerCase()}.`;
  }
}
