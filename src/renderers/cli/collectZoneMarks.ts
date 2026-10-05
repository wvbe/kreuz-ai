import { z } from "zod";
import type { GameSession } from "../../game/api/GameSession";
import type { ZoneMark } from "./renderAsciiMap";

const zonesSchema = z.array(
  z.object({ zoneTypeId: z.string(), active: z.boolean(), tiles: z.array(z.number()) }),
);

/**
 * Reads the zones of one map through the `zones` query, for the zone overlay of the ASCII map.
 *
 * @param session - The session to read.
 * @param mapId - The map to mark.
 * @returns One mark per zone, ascending by zone id; empty without a game or zones.
 */
export function collectZoneMarks(session: GameSession, mapId: number): ZoneMark[] {
  const result = session.query.run("zones", { mapId });
  const parsed = result.ok ? zonesSchema.safeParse(result.data) : null;
  return parsed?.success === true
    ? parsed.data.map((zone) => ({
        cells: zone.tiles,
        zoneTypeId: zone.zoneTypeId,
        active: zone.active,
      }))
    : [];
}
