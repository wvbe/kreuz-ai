import type { JsonValue } from "../engine/EventBus";
import { BlockedReasonKind, StatusState } from "./statusTypes";
import type { Reason, StatusSubjectRef, SubjectStatus } from "./statusTypes";

/**
 * The precedence of spec 025 FR-004: the order in which reasons are listed, the first is the
 * primary reason.
 */
export const reasonPrecedence: readonly BlockedReasonKind[] = Object.values(BlockedReasonKind);

/**
 * Kinds that need no grace period (spec 025 FR-006): the player or the rules caused them
 * directly, so they are published at once.
 */
const immediateKinds: readonly BlockedReasonKind[] = [
  BlockedReasonKind.Paused,
  BlockedReasonKind.NoSeatOfGovernment,
  BlockedReasonKind.NoSteward,
  BlockedReasonKind.LockedByTier,
  BlockedReasonKind.ScopeZoneMissing,
  BlockedReasonKind.NoOrders,
];

/**
 * The params that name what a reason is about, in the order they are looked at when two reasons
 * of the same kind are compared. Counters such as `available` are not part of the identity.
 */
const identityParams: readonly string[] = [
  "materialId",
  "zoneTypeId",
  "workstationTag",
  "tag",
  "jobBoardId",
  "zoneId",
  "postingId",
  "boardId",
  "productionOrderId",
  "entityId",
];

/**
 * Builds a reason.
 *
 * @param kind - The kind.
 * @param params - Int, bool and id params.
 * @param causeRef - The subject that explains the reason, or null.
 * @returns The reason.
 */
export function makeReason(
  kind: BlockedReasonKind,
  params: { [name: string]: JsonValue } = {},
  causeRef: StatusSubjectRef | null = null,
): Reason {
  return { kind, params, causeRef };
}

/**
 * A stable text key of a subject (`Citizen#5`), for sets and records.
 *
 * @param ref - The subject.
 * @returns The key.
 */
export function refKey(ref: StatusSubjectRef): string {
  return `${ref.kind}#${ref.id}`;
}

/**
 * The identity of a reason: its kind plus the first identifying param (`MissingInput:flour`).
 * Two reasons with the same identity are "the same reason" for settling and events even when
 * their counters changed.
 *
 * @param reason - The reason.
 * @returns The identity text.
 */
export function reasonKey(reason: Reason): string {
  for (const name of identityParams) {
    const value = reason.params[name];
    if (value !== undefined) {
      return `${reason.kind}:${String(value)}`;
    }
  }
  return reason.kind;
}

/**
 * The key of a whole status for settling: the state and the identity of the primary reason.
 *
 * @param status - The status.
 * @returns For example `Blocked|MissingInput:flour`.
 */
export function statusKey(status: SubjectStatus): string {
  const primary = status.reasons[0];
  return primary === undefined || status.state === StatusState.Active
    ? StatusState.Active
    : `${status.state}|${reasonKey(primary)}`;
}

/**
 * Whether a reason is published without a grace period.
 *
 * @param reason - The reason.
 * @returns True for the kinds of spec 025 FR-006.
 */
export function isImmediateReason(reason: Reason): boolean {
  return immediateKinds.includes(reason.kind);
}

/**
 * Orders reasons by the precedence of spec 025 FR-004, keeping the order of equal kinds (the
 * source order: recipe inputs, material lists, gaps).
 *
 * @param reasons - Reasons in provider order.
 * @returns A new sorted list.
 */
export function sortReasons(reasons: readonly Reason[]): Reason[] {
  return reasons
    .map((reason, index) => ({ reason, index }))
    .sort(
      (left, right) =>
        reasonPrecedence.indexOf(left.reason.kind) - reasonPrecedence.indexOf(right.reason.kind) ||
        left.index - right.index,
    )
    .map((entry) => entry.reason);
}

/**
 * Looks up the reason kind of a name used by an owning system (production and construction use
 * the 025 names for their own subset enums).
 *
 * @param name - A kind name.
 * @returns The kind.
 * @throws Error for a name that is no reason kind.
 */
export function toReasonKind(name: string): BlockedReasonKind {
  const found = Object.values(BlockedReasonKind).find((kind) => kind === name);
  if (found === undefined) {
    throw new Error(`unknown blocked reason kind "${name}"`);
  }
  return found;
}
