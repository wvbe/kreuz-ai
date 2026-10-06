import type { DwellingSummary } from "../../../game/housing/housingTypes";
import type { ZoneView } from "../../../game/zones/zoneTypes";
import type { ZoneOverlay } from "./MapCanvasProps";

const bellTowerZoneId = "bell_tower";
const dwellingZoneId = "dwelling";

/**
 * Turns the zones of a map into what the canvas draws: the tint of every zone and, for dwelling
 * and Bell Tower zones, the model that stands on them (spec 024 FR-004, FR-033, FR-042, FR-044).
 * A dwelling shows the model of its current level, and a flag while its downgrade streak runs
 * (`housing.dwelling.at-risk` raises the streak and it resets with a met requirement or a level
 * change). A Bell Tower shows its ring while its zone id is in `ringing`.
 *
 * @param zones - Rows of the `zones` query of the active map.
 * @param dwellings - Rows of the `dwellings` query.
 * @param ringing - Ids of the zones whose bell rang a moment ago.
 * @returns One overlay per zone, in the order given.
 */
export function buildZoneOverlays(
  zones: readonly ZoneView[],
  dwellings: readonly DwellingSummary[],
  ringing: ReadonlySet<number | undefined>,
): ZoneOverlay[] {
  const dwellingById = new Map(dwellings.map((dwelling) => [dwelling.id, dwelling]));
  return zones.map((zone) => {
    const overlay: ZoneOverlay = {
      zoneId: zone.id,
      zoneTypeId: zone.zoneTypeId,
      cells: zone.tiles,
      active: zone.active,
    };
    const dwelling = zone.zoneTypeId === dwellingZoneId ? dwellingById.get(zone.id) : undefined;
    const bellTower = zone.zoneTypeId === bellTowerZoneId && zone.active;
    if (dwelling !== undefined || bellTower) {
      overlay.structure = {
        dwellingLevel: dwelling?.level ?? null,
        atRisk: dwelling !== undefined && dwelling.active && dwelling.downgradeStreak > 0,
        bellTower,
        ringing: ringing.has(zone.id),
      };
    }
    return overlay;
  });
}
