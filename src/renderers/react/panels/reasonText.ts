import type { JsonValue } from "../../../game/engine/EventBus";
import { blockedLabel } from "../map/blockedLabel";
import type { StatusActivity, StatusReason, StatusSubject } from "./statusViews";

/**
 * Turns a content id into words (`oak_plank` to `oak plank`).
 *
 * @param id - A content id.
 * @returns The words.
 */
export function humanizeId(id: string): string {
  return id.replaceAll("_", " ").replaceAll(".", " ");
}

/**
 * What {@link describeReason} needs of a reason (the reasons of `idle-blocked`, the order and
 * construction views have no `causeRef`).
 */
export type ReasonLike = { kind: string; params: { readonly [name: string]: JsonValue } };

const reasonLabels: { readonly [kind: string]: string } = {
  Paused: "Paused by the player",
  NoSeatOfGovernment: "The settlement has no seat of government (a throne room)",
  NoSteward: "No steward is appointed",
  LockedByTier: "Locked until the settlement reaches a higher tier",
  NoJobsAvailable: "No jobs are available",
  NoReachableJobBoard: "No job board can be reached",
  NoQualifiedWorker: "No worker is qualified",
  AwaitingTownCrier: "Waiting for a town crier to carry the news",
  AwaitingWorker: "Waiting for a worker to take it",
  AwaitingDecision: "Deciding what to do next",
  NoOrders: "No orders to work on",
  ZoneInactive: "The zone is not active",
  Unexplained: "No reason known",
};

function describeValue(value: JsonValue): string {
  if (typeof value === "string") {
    return humanizeId(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => describeValue(item)).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([name, item]) => `${name} ${describeValue(item)}`)
      .join(", ");
  }
  return String(value);
}

function describeParams(params: { readonly [name: string]: JsonValue }): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== false && value !== null)
    .map(([name, value]) => (value === true ? name : `${name} ${describeValue(value)}`));
  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
}

/**
 * One reason as a short English sentence fragment: `Missing input (materialId flour, ...)` style
 * with ids turned into words. The label of a kind with a template reads as a sentence.
 *
 * @param reason - A reason of `explain` or `idle-blocked`.
 * @returns The text.
 */
export function describeReason(reason: StatusReason | ReasonLike): string {
  if (reason.kind === "MissingInput") {
    const material = reason.params["materialId"];
    const required = reason.params["required"];
    const available = reason.params["available"];
    const nobody = reason.params["noProducer"] === true ? "; nothing produces it" : "";
    return `Missing input: ${typeof material === "string" ? humanizeId(material) : "?"} (needs ${String(required)}, has ${String(available)}${nobody})`;
  }
  const label = reasonLabels[reason.kind] ?? blockedLabel(reason.kind);
  return `${label}${describeParams(reason.params)}`;
}

/**
 * What an Active subject is doing, as words.
 *
 * @param activity - The activity of `explain`.
 * @returns The text.
 */
export function describeActivity(activity: StatusActivity): string {
  return `${blockedLabel(activity.kind)}${describeParams(activity.params)}`;
}

const entityKinds: readonly string[] = [
  "Citizen",
  "Workstation",
  "ConstructionSite",
  "Zone",
  "JobBoard",
  "LoosePile",
  "Dwelling",
];

/**
 * Whether a status subject is an entity a click can select (postings and orders are not).
 *
 * @param subject - The subject.
 * @returns True for entity kinds.
 */
export function isEntitySubject(subject: StatusSubject): boolean {
  return entityKinds.includes(subject.kind);
}
