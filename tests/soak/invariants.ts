import type { GameSession } from "../../src/game/api/GameSession";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { buildIdleBlockedView } from "../../src/game/status/idleBlocked";
import { BlockedReasonKind } from "../../src/game/status/statusTypes";

// Invariants of a running game that must hold at every checkpoint of a soak run (plan task 7.1):
// integer-only state, no dangling entity references, no Unexplained status, reservations that
// match the stock, and an event queue that stays small. Each check returns readable violations.

type Json = JsonValue;
/**
 * A JSON object, the shape of a parsed save text.
 */
export type JsonObject = { [key: string]: Json };

/**
 * Property names whose value is the id of a live entity (a number, null, or an array of numbers
 * for the plural spellings) wherever they appear in entity components or system sections.
 */
export const entityReferenceKeys: ReadonlySet<string> = new Set([
  "claimantId",
  "crafterId",
  "workstationId",
  "leaderId",
  "homeDwellingId",
  "holderId",
  "inventoryOwnerId",
  "boardId",
  "posterFactionId",
  "targetFactionId",
  "senderFactionId",
  "fromFactionId",
  "destinationId",
  "dwellingId",
  "stewardEntityId",
]);

/**
 * Subtrees that record the past (finished postings, the chronicle, journals, reports): ids in
 * them may name entities that no longer exist, so the reference check skips them.
 */
export const historicalKeys: ReadonlySet<string> = new Set([
  "history",
  "recent",
  "moments",
  "journal",
  "reported",
  "finest",
  "backoffs",
  "mergeOffers",
]);

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Walks a JSON value and reports every number that is not a safe integer (NaN, infinities and
 * fractions never belong in game state, Constitution II).
 *
 * @param value - The value to walk.
 * @param path - Where the value is, for the message.
 * @param violations - Receives the findings.
 */
export function collectNonIntegers(value: Json, path: string, violations: string[]): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      violations.push(`non-integer ${String(value)} at ${path}`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectNonIntegers(item, `${path}[${index}]`, violations));
  } else if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectNonIntegers(item, `${path}.${key}`, violations);
    }
  }
}

function collectReferences(
  value: Json,
  path: string,
  exists: (id: number) => boolean,
  violations: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectReferences(item, `${path}[${index}]`, exists, violations),
    );
  } else if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (historicalKeys.has(key)) {
        continue;
      }
      if (entityReferenceKeys.has(key) && typeof item === "number" && !exists(item)) {
        violations.push(`dangling ${key}=${item} at ${path}`);
      }
      collectReferences(item, `${path}.${key}`, exists, violations);
    }
  }
}

/**
 * Every `*Id` reference of {@link entityReferenceKeys} in entity components and system sections
 * must name an entity that exists, and every job posting still open or claimed must point at a
 * living target.
 *
 * @param root - The parsed save text.
 * @returns Violations, empty when the state is consistent.
 */
export function checkReferences(root: JsonObject): string[] {
  const violations: string[] = [];
  const entities = root["entities"] as JsonObject[];
  const ids = new Set(entities.map((entity) => entity["id"] as number));
  const exists = (id: number): boolean => ids.has(id);
  for (const entity of entities) {
    collectReferences(
      entity["components"] as Json,
      `entity#${String(entity["id"])}`,
      exists,
      violations,
    );
  }
  collectReferences(root["systems"] as Json, "systems", exists, violations);
  return violations;
}

/**
 * Reservations (`systems.reservations`) must have unique ids, living holders and owners, and may
 * not hold more of a material than its owner has in store.
 *
 * @param root - The parsed save text.
 * @returns Violations.
 */
export function checkReservations(root: JsonObject): string[] {
  const violations: string[] = [];
  const section = (root["systems"] as JsonObject)["reservations"] as JsonObject | undefined;
  const reservations = (section?.["reservations"] ?? []) as JsonObject[];
  const entities = new Map(
    (root["entities"] as JsonObject[]).map((entity) => [entity["id"] as number, entity]),
  );
  const seen = new Set<number>();
  const reserved = new Map<string, number>();
  for (const reservation of reservations) {
    const id = reservation["id"] as number;
    if (seen.has(id)) {
      violations.push(`reservation ${id} appears twice`);
    }
    seen.add(id);
    const owner = entities.get(reservation["inventoryOwnerId"] as number);
    if (owner === undefined) {
      violations.push(
        `reservation ${id}: inventory owner ${String(reservation["inventoryOwnerId"])} is gone`,
      );
      continue;
    }
    if (!entities.has(reservation["holderId"] as number)) {
      violations.push(`reservation ${id}: holder ${String(reservation["holderId"])} is gone`);
    }
    const key = `${String(reservation["inventoryOwnerId"])}/${String(reservation["materialId"])}`;
    reserved.set(key, (reserved.get(key) ?? 0) + (reservation["quantity"] as number));
  }
  for (const [key, quantity] of reserved) {
    const [ownerId, materialId] = key.split("/") as [string, string];
    const inventory = (entities.get(Number(ownerId))?.["components"] as JsonObject)["Inventory"] as
      JsonObject | undefined;
    const slots = (inventory?.["slots"] ?? []) as JsonObject[];
    const have = slots
      .filter((slot) => slot["materialId"] === materialId)
      .reduce((sum, slot) => sum + (slot["quantity"] as number), 0);
    if (quantity > have) {
      violations.push(
        `reservations of ${materialId} on #${ownerId} total ${quantity}, stock ${have}`,
      );
    }
  }
  return violations;
}

/**
 * Every Idle or Blocked subject has an explanation other than `Unexplained` (spec 025).
 *
 * @param session - The running game.
 * @returns Violations, one per unexplained subject.
 */
export function checkNoUnexplained(session: GameSession): string[] {
  return buildIdleBlockedView(session.engine, { includeUnsettled: true })
    .filter((row) => row.reasons.some((reason) => reason.kind === BlockedReasonKind.Unexplained))
    .map((row) => `${row.subject.kind}#${row.subject.id} is Unexplained`);
}

/**
 * Inventories hold positive integer quantities, and the serialized event queue and the command
 * queue stay small (a leak would grow them without bound).
 *
 * @param root - The parsed save text.
 * @param queueLimit - The largest allowed length of the event queue and of the command queue.
 * @returns Violations.
 */
export function checkBounded(root: JsonObject, queueLimit: number): string[] {
  const violations: string[] = [];
  const queue = ((root["eventQueue"] as JsonObject)["queue"] ?? []) as Json[];
  if (queue.length > queueLimit) {
    violations.push(`event queue holds ${queue.length} events (limit ${queueLimit})`);
  }
  const commands = (((root["systems"] as JsonObject)["commandQueue"] as JsonObject)["pending"] ??
    []) as Json[];
  if (commands.length > queueLimit) {
    violations.push(`command queue holds ${commands.length} commands (limit ${queueLimit})`);
  }
  for (const entity of root["entities"] as JsonObject[]) {
    const inventory = (entity["components"] as JsonObject)["Inventory"] as JsonObject | undefined;
    for (const slot of (inventory?.["slots"] ?? []) as JsonObject[]) {
      const quantity = slot["quantity"] as number;
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        violations.push(
          `entity#${String(entity["id"])} holds ${String(quantity)} ${String(slot["materialId"])}`,
        );
      }
    }
  }
  return violations;
}

/**
 * Every animal has a position and no `Citizen` component (animals are never settlers), and
 * there are at most `limit` of them (wild fauna stays bounded).
 *
 * @param root - The parsed save text.
 * @param limit - The largest allowed number of animals.
 * @returns Violations.
 */
export function checkAnimals(root: JsonObject, limit: number): string[] {
  const violations: string[] = [];
  let animals = 0;
  for (const entity of root["entities"] as JsonObject[]) {
    const components = entity["components"] as JsonObject;
    if (components["Animal"] === undefined) {
      continue;
    }
    animals += 1;
    if (components["Position"] === undefined) {
      violations.push(`animal#${String(entity["id"])} has no Position`);
    }
    if (components["Citizen"] !== undefined) {
      violations.push(`animal#${String(entity["id"])} is a Citizen`);
    }
  }
  if (animals > limit) {
    violations.push(`${animals} animals (limit ${limit})`);
  }
  return violations;
}

/**
 * Runs every state invariant against the current state of a session.
 *
 * @param session - The running game.
 * @param queueLimit - Bound of the event and command queues.
 * @returns All violations found; empty when the game is healthy.
 */
export function checkInvariants(session: GameSession, queueLimit = 2000): string[] {
  const saved = session.save();
  if (!saved.ok) {
    return [`save failed: ${saved.error.message}`];
  }
  const root = JSON.parse(saved.data as string) as JsonObject;
  const violations: string[] = [];
  for (const key of ["entities", "maps", "systems", "time", "counters", "prng"]) {
    collectNonIntegers(root[key] as Json, key, violations);
  }
  return [
    ...violations,
    ...checkReferences(root),
    ...checkReservations(root),
    ...checkBounded(root, queueLimit),
    ...checkAnimals(root, 200),
    ...checkNoUnexplained(session),
  ];
}
