import type { GameSession } from "../../game/api/GameSession";
import type { MapMarker } from "./renderAsciiMap";

/**
 * Finds the cells of one map that carry entities, by reading every entity's `Position` component
 * through the public query facade.
 *
 * @param session - The session to read.
 * @param mapId - The map to mark.
 * @returns One marker per entity standing on the map.
 */
export function collectEntityMarkers(session: GameSession, mapId: number): MapMarker[] {
  const markers: MapMarker[] = [];
  for (const summary of session.query.entities().entities) {
    const position = session.query.entity(summary.id)?.components["Position"];
    if (
      typeof position === "object" &&
      position !== null &&
      !Array.isArray(position) &&
      position["mapId"] === mapId &&
      typeof position["cellIndex"] === "number"
    ) {
      markers.push({ cell: position["cellIndex"] });
    }
  }
  return markers;
}
