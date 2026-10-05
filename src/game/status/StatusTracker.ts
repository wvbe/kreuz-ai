import { z } from "zod";
import { jsonValueSchema } from "../ecs/jsonData";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { isImmediateReason, reasonKey, refKey, statusKey } from "./reasons";
import { BlockedReasonKind, statusGraceTicks, StatusState, StatusSubjectKind } from "./statusTypes";
import type {
  Reason,
  StatusBlocked,
  StatusRecord,
  StatusSubjectRef,
  StatusUnblocked,
  SubjectStatus,
} from "./statusTypes";

const subjectSchema = z
  .object({ kind: z.nativeEnum(StatusSubjectKind), id: z.number().int().min(1) })
  .strict();

const reasonSchema = z
  .object({
    kind: z.nativeEnum(BlockedReasonKind),
    params: z.record(z.string(), jsonValueSchema),
    causeRef: subjectSchema.nullable(),
  })
  .strict();

const recordSchema = z
  .object({
    subject: subjectSchema,
    state: z.nativeEnum(StatusState),
    reason: reasonSchema.nullable(),
    sinceTick: z.number().int().min(0),
    reasonSinceTick: z.number().int().min(0),
    stallStart: z.number().int().min(0).nullable(),
    pendingKey: z.string().nullable(),
    pendingSince: z.number().int().min(0).nullable(),
  })
  .strict();

const trackerSectionSchema = z.object({ records: z.array(recordSchema) }).strict();

/**
 * What one observation published: at most one of the two events.
 */
export type StatusTransition = {
  blocked: StatusBlocked | null;
  unblocked: StatusUnblocked | null;
};

const nothing: StatusTransition = { blocked: null, unblocked: null };

function copyReason(reason: Reason): Reason {
  return {
    kind: reason.kind,
    params: { ...reason.params },
    causeRef: reason.causeRef === null ? null : { ...reason.causeRef },
  };
}

/**
 * The settle tracker of spec 025 FR-006/FR-007 and DECISIONS D-18: per subject it remembers the
 * published state and primary reason, since when the subject has been stalled and the change that
 * waits out its grace period. Everything else about a status is derived on demand, so this is the
 * only state of the status system; it is saved in the root section `statuses`.
 */
export class StatusTracker {
  private readonly byKey = new Map<string, StatusRecord>();

  /**
   * Feeds one observation (the status evaluated at `tick`) and returns what became published.
   * A non-Active state or a new primary reason must be observed for `statusGraceTicks`
   * continuous ticks before it is published (immediately for `Paused`, `NoOrders` ...); a change
   * back to Active is published at once; an observation equal to the published status clears any
   * pending change. `sinceTick` is the first tick of the whole continuous stall, it does not move
   * when the primary reason changes inside a stall.
   *
   * @param ref - The subject.
   * @param status - Its status now.
   * @param tick - The tick being processed.
   * @returns The events to emit, if any.
   */
  observe(ref: StatusSubjectRef, status: SubjectStatus, tick: number): StatusTransition {
    const key = refKey(ref);
    let record = this.byKey.get(key);
    if (record === undefined) {
      record = {
        subject: { ...ref },
        state: StatusState.Active,
        reason: null,
        sinceTick: tick,
        reasonSinceTick: tick,
        stallStart: null,
        pendingKey: null,
        pendingSince: null,
      };
      this.byKey.set(key, record);
    }
    const observed = statusKey(status);
    const published =
      record.reason === null || record.state === StatusState.Active
        ? StatusState.Active
        : `${record.state}|${reasonKey(record.reason)}`;
    if (observed === published) {
      record.pendingKey = null;
      record.pendingSince = null;
      if (status.state === StatusState.Active) {
        record.stallStart = null;
      }
      return nothing;
    }
    if (status.state === StatusState.Active) {
      const previous = record.reason;
      const stalledTicks = tick - record.sinceTick;
      record.state = StatusState.Active;
      record.reason = null;
      record.sinceTick = tick;
      record.reasonSinceTick = tick;
      record.stallStart = null;
      record.pendingKey = null;
      record.pendingSince = null;
      return {
        blocked: null,
        unblocked: { subject: { ...ref }, previousReason: previous, stalledTicks, removed: false },
      };
    }
    const primary = status.reasons[0];
    if (primary === undefined) {
      return nothing;
    }
    record.stallStart ??= tick;
    if (record.pendingKey !== observed || record.pendingSince === null) {
      record.pendingKey = observed;
      record.pendingSince = tick;
    }
    if (!isImmediateReason(primary) && tick - record.pendingSince < statusGraceTicks) {
      return nothing;
    }
    const previousReason = record.state === StatusState.Active ? null : record.reason;
    const sinceTick = record.state === StatusState.Active ? record.stallStart : record.sinceTick;
    record.state = status.state;
    record.reason = copyReason(primary);
    record.sinceTick = sinceTick;
    record.reasonSinceTick = record.pendingSince;
    record.pendingKey = null;
    record.pendingSince = null;
    return {
      blocked: {
        subject: { ...ref },
        state: status.state,
        reason: copyReason(primary),
        previousReason: previousReason === null ? null : copyReason(previousReason),
        sinceTick,
      },
      unblocked: null,
    };
  }

  /**
   * Drops the records of subjects that are not in `liveKeys` any more and reports an
   * `unblocked {removed: true}` for each one that was published as non-Active.
   *
   * @param liveKeys - `refKey` of every subject seen in this pass.
   * @param tick - The tick being processed.
   * @returns The `removed` events, in record order.
   */
  retainOnly(liveKeys: ReadonlySet<string>, tick: number): StatusUnblocked[] {
    const events: StatusUnblocked[] = [];
    for (const [key, record] of [...this.byKey]) {
      if (liveKeys.has(key)) {
        continue;
      }
      this.byKey.delete(key);
      if (record.state !== StatusState.Active) {
        events.push({
          subject: { ...record.subject },
          previousReason: record.reason === null ? null : copyReason(record.reason),
          stalledTicks: tick - record.sinceTick,
          removed: true,
        });
      }
    }
    return events;
  }

  /**
   * Drops records of subjects that are not in `liveKeys`, silently (used after a load: spec 025
   * FR-014, DECISIONS D-18 "orphan statuses purged on load").
   *
   * @param liveKeys - `refKey` of every live subject.
   * @returns How many records were dropped.
   */
  purgeOrphans(liveKeys: ReadonlySet<string>): number {
    let dropped = 0;
    for (const key of [...this.byKey.keys()]) {
      if (!liveKeys.has(key)) {
        this.byKey.delete(key);
        dropped += 1;
      }
    }
    return dropped;
  }

  /**
   * The record of one subject.
   *
   * @param ref - The subject.
   * @returns A copy, or null when the subject was never observed.
   */
  get(ref: StatusSubjectRef): StatusRecord | null {
    const record = this.byKey.get(refKey(ref));
    return record === undefined
      ? null
      : {
          ...record,
          subject: { ...record.subject },
          reason: record.reason === null ? null : copyReason(record.reason),
        };
  }

  /**
   * All records in observation order.
   *
   * @returns Copies.
   */
  records(): StatusRecord[] {
    return [...this.byKey.values()].map((record) => ({
      ...record,
      subject: { ...record.subject },
      reason: record.reason === null ? null : copyReason(record.reason),
    }));
  }

  /**
   * The root save section `statuses`.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "statuses",
      location: SaveSectionLocation.Root,
      schema: trackerSectionSchema,
      serialize: (): JsonValue => ({ records: this.records() }),
      restore: (saved: JsonValue) => {
        this.byKey.clear();
        for (const record of trackerSectionSchema.parse(saved).records) {
          this.byKey.set(refKey(record.subject), record);
        }
      },
      defaultForOlderSaves: () => ({ records: [] }),
    };
  }
}
