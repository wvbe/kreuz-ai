import { describe, expect, it } from "vitest";
import type { DwellingSummary } from "../../../game/housing/housingTypes";
import type { ZoneView } from "../../../game/zones/zoneTypes";
import { buildZoneOverlays } from "./buildZoneOverlays";

function zone(id: number, zoneTypeId: string, active = true): ZoneView {
  // only the fields the overlay reads; the rest of the row is irrelevant here
  return { id, zoneTypeId, tiles: [id * 10, id * 10 + 1], active } as ZoneView;
}

function dwelling(id: number, level: string, downgradeStreak: number): DwellingSummary {
  return { id, level, active: true, downgradeStreak } as DwellingSummary;
}

describe("buildZoneOverlays", () => {
  // @covers 024:FR-004 024:FR-042
  it("puts the model of the current level on a dwelling zone", () => {
    const overlays = buildZoneOverlays(
      [zone(1, "dwelling"), zone(2, "dwelling"), zone(3, "stockpile")],
      [dwelling(1, "hovel", 0), dwelling(2, "burgher_house", 0)],
      new Set(),
    );
    expect(overlays[0]?.structure?.dwellingLevel).toBe("hovel");
    expect(overlays[1]?.structure?.dwellingLevel).toBe("burgher_house");
    expect(overlays[2]?.structure).toBeUndefined();
  });

  // @covers 024:FR-044
  it("flags a dwelling while its downgrade streak runs and clears the flag when it resets", () => {
    const atRisk = (streak: number) =>
      buildZoneOverlays([zone(1, "dwelling")], [dwelling(1, "cottage", streak)], new Set())[0]
        ?.structure?.atRisk;
    expect(atRisk(0)).toBe(false);
    expect(atRisk(2)).toBe(true);
    expect(atRisk(0)).toBe(false);
  });

  // @covers 024:FR-033
  it("shows a Bell Tower once it is active and its ring only for a zone that rang", () => {
    const rows = [zone(5, "bell_tower"), zone(6, "bell_tower"), zone(7, "bell_tower", false)];
    const overlays = buildZoneOverlays(rows, [], new Set([5]));
    expect(overlays[0]?.structure).toMatchObject({ bellTower: true, ringing: true });
    expect(overlays[1]?.structure).toMatchObject({ bellTower: true, ringing: false });
    expect(overlays[2]?.structure).toBeUndefined();
  });
});
