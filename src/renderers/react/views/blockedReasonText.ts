/**
 * The reason kinds of the status system (spec 025 FR-003) in precedence order. The renderer keeps
 * its own list of the serialized names (a test compares it with the engine enum), because values
 * of the game enums may not be imported here.
 */
export const blockedReasonKinds: readonly string[] = [
  "Paused",
  "NoSeatOfGovernment",
  "NoSteward",
  "LockedByTier",
  "ScopeZoneMissing",
  "ZoneRequirementsUnmet",
  "ZoneInactive",
  "MissingWorkstation",
  "MissingRoom",
  "LocationBlocked",
  "Unreachable",
  "NoReachableJobBoard",
  "NoQualifiedWorker",
  "MissingTool",
  "NoHouseholdStorage",
  "MissingInput",
  "NoStorageDestination",
  "OutputBlocked",
  "AwaitingTownCrier",
  "AwaitingWorker",
  "AwaitingDecision",
  "NoJobsAvailable",
  "DwellingRequirementsUnmet",
  "NoOrders",
  "Unexplained",
];

/**
 * A reason as the engine publishes it (kind, id/int/bool params, optional cause), reduced to what
 * the views read.
 */
export type ReasonLike = {
  kind: string;
  params: { readonly [name: string]: string | number | boolean | null | object };
  causeRef: { kind: string; id: number } | null;
};

/**
 * Turns an id such as `iron_ore` into words (`iron ore`).
 *
 * @param id - A content id.
 * @returns Lower-case words.
 */
export function humanizeId(id: string): string {
  return id.replace(/[_-]+/g, " ");
}

function word(reason: ReasonLike, name: string, fallback: string): string {
  const value = reason.params[name];
  return typeof value === "string" ? humanizeId(value) : fallback;
}

function template(reason: ReasonLike): string | null {
  switch (reason.kind) {
    case "Paused":
      return "The job board is paused.";
    case "NoSeatOfGovernment":
      return "There is no seat of government yet.";
    case "NoSteward":
      return "No Steward is appointed.";
    case "LockedByTier": {
      const tier = reason.params["tier"];
      return `Locked until the settlement grows${typeof tier === "string" ? ` to ${humanizeId(tier)}` : ""}.`;
    }
    case "ScopeZoneMissing":
      return `Needs a ${word(reason, "zoneTypeId", "matching")} zone.`;
    case "ZoneRequirementsUnmet":
      return `The ${word(reason, "zoneTypeId", "zone")} zone does not meet its requirements.`;
    case "ZoneInactive":
      return "Its zone is not active.";
    case "MissingWorkstation":
      return `Needs a ${word(reason, "workstationTag", "workstation")}.`;
    case "MissingRoom":
      return "Needs an enclosed room.";
    case "LocationBlocked":
      return "The place is blocked.";
    case "Unreachable":
      return "It cannot be reached.";
    case "NoReachableJobBoard":
      return "No job board can be reached.";
    case "NoQualifiedWorker":
      return "No citizen is qualified for the work.";
    case "MissingTool":
      return `Needs a ${word(reason, "tag", "tool")}.`;
    case "NoHouseholdStorage":
      return "The household has nowhere to store things.";
    case "MissingInput":
      return `Missing ${word(reason, "materialId", "an input")}.`;
    case "NoStorageDestination":
      return `Nowhere to store ${word(reason, "materialId", "the goods")}.`;
    case "OutputBlocked":
      return "The output has nowhere to go.";
    case "AwaitingTownCrier":
      return "Waiting for the Town Crier to carry the news.";
    case "AwaitingWorker":
      return "Waiting for a worker to take the job.";
    case "AwaitingDecision":
      return "About to choose its next job.";
    case "NoJobsAvailable":
      return "There is no work to do.";
    case "DwellingRequirementsUnmet":
      return "The dwelling does not meet its requirements.";
    case "NoOrders":
      return "No orders to work on.";
    case "Unexplained":
      return "No reason is known.";
    default:
      return null;
  }
}

/**
 * A short title for a reason kind (group heading, settings toggle).
 *
 * @param kind - The serialized kind, for example `MissingInput`.
 * @returns For example `Missing input`.
 */
export function blockedReasonTitle(kind: string): string {
  const words = kind.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * One line of modern English for a blocked or idle reason (spec 024 FR-025). Unknown kinds fall
 * back to the kind name as words, so a new kind never shows blank.
 *
 * @param reason - The reason.
 * @returns A sentence.
 */
export function describeBlockedReason(reason: ReasonLike): string {
  return template(reason) ?? `${blockedReasonTitle(reason.kind)}.`;
}
