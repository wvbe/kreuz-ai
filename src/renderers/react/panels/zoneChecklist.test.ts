import { describe, expect, it } from "vitest";
import { ContentKind } from "../../../game/api/contentQueries";
import type { ContentEntryView } from "../../../game/api/contentQueries";
import { ZoneGapKind, ZoneStatus } from "../../../game/zones/zoneTypes";
import type { ZoneGap, ZoneView } from "../../../game/zones/zoneTypes";
import { zoneChecklist } from "./zoneChecklist";

const bedroom: ContentEntryView = {
  kind: ContentKind.Zone,
  id: "bedroom",
  name: "Bedroom",
  unlockTier: null,
  fields: {
    minTiles: 4,
    requiresRoom: true,
    furnitureRequirements: [
      [
        { kind: "tag", ref: "bed", count: 2 },
        { kind: "id", ref: "cot", count: 1, perTiles: 4 },
      ],
    ],
    requiresJobBoard: true,
  },
  links: [],
  usedBy: [],
};

function zone(gaps: ZoneGap[], tiles: number): ZoneView {
  return {
    id: 5,
    zoneTypeId: "bedroom",
    mapId: 1,
    tiles: Array.from({ length: tiles }, (_, index) => index),
    isRoom: true,
    active: gaps.length === 0,
    status: gaps.length === 0 ? ZoneStatus.Active : ZoneStatus.Incomplete,
    gaps,
    filter: null,
    createdTick: 0,
    affinity: 0,
    workers: [],
  };
}

describe("zoneChecklist", () => {
  it("marks every item met for a zone without gaps", () => {
    const items = zoneChecklist(zone([], 6), bedroom);
    expect(items.map((item) => item.met)).toEqual([true, true, true, true]);
    expect(items[2]?.label).toBe("2 bed or 1 cot per 4 tiles");
  });

  it("opens exactly the items the gaps name, with the numbers", () => {
    const items = zoneChecklist(
      zone(
        [
          { kind: ZoneGapKind.TooSmall, requirement: null, required: 4, present: 2 },
          { kind: ZoneGapKind.NotEnclosed, requirement: null, required: null, present: null },
          {
            kind: ZoneGapKind.MissingFurniture,
            requirement: "2x tag:bed or 1x id:cot per 4 tiles",
            required: 2,
            present: 0,
          },
        ],
        2,
      ),
      bedroom,
    );
    expect(items.map((item) => item.met)).toEqual([false, false, false, true]);
    expect(items[0]?.detail).toBe("2 of 4");
    expect(items[2]?.detail).toBe("0 of 2");
  });
});
