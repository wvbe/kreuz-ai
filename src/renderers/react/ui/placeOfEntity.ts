import type { QueryState } from "../engine/useGameState";
import type { JsonValue } from "../../../game/engine/EventBus";

/**
 * Where an entity is: a map and a cell.
 */
export type EntityPlace = { mapId: number; cell: number };

function isObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the place of an entity out of the `entity` query: its `Position`, or the first tile of its
 * `Zone`. Null for an entity without either (or one that is gone).
 *
 * @param result - The result of the `entity` query.
 * @returns The place, or null.
 */
export function placeOfEntity(result: QueryState<JsonValue>): EntityPlace | null {
  if (!result.ok || !isObject(result.data)) {
    return null;
  }
  const components = result.data["components"];
  if (!isObject(components)) {
    return null;
  }
  const position = components["Position"];
  if (
    isObject(position) &&
    typeof position["mapId"] === "number" &&
    typeof position["cellIndex"] === "number"
  ) {
    return { mapId: position["mapId"], cell: position["cellIndex"] };
  }
  const zone = components["Zone"];
  if (isObject(zone) && typeof zone["mapId"] === "number" && Array.isArray(zone["tiles"])) {
    const first = zone["tiles"][0];
    return typeof first === "number" ? { mapId: zone["mapId"], cell: first } : null;
  }
  return null;
}
