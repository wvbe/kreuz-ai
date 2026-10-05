import { describe, expect, it } from "vitest";
import {
  formatBuildMenu,
  formatPlacement,
  formatSites,
  placementRefusal,
} from "./formatConstruction";

const site = {
  jobId: 12,
  kind: "Construction",
  prototypeId: "oven",
  status: "supplying",
  mapId: 1,
  cellIndex: 326,
  required: [{ materialId: "stone_block", quantity: 6 }],
  delivered: [{ materialId: "stone_block", quantity: 2 }],
  progress: 0,
  durationTicks: 0,
  builderId: null,
  supplierId: 4,
  priority: 50,
  urgent: false,
  paused: false,
  targetEntityId: null,
  blockers: [],
};

describe("formatSites", () => {
  it("prints one line per job with materials, builder and blockers", () => {
    expect(formatSites({ jobs: [site], recent: [] })).toEqual([
      "#12 Construction oven at 1:326: supplying, priority 50, stone_block 2/6, supplier #4",
    ]);
    const blockers: { kind: string; params: { [name: string]: string | number } }[] = [
      { kind: "MissingInput", params: { materialId: "stone_block", available: 0 } },
      { kind: "Paused", params: {} },
    ];
    const working = {
      ...site,
      status: "building",
      urgent: true,
      paused: true,
      builderId: 7,
      progress: 5,
      durationTicks: 48,
      supplierId: null,
      blockers,
    };
    expect(formatSites({ jobs: [working], recent: [] })).toEqual([
      "#12 Construction oven at 1:326: building, priority 50, urgent, paused, stone_block 2/6, 5/48 by #7",
      "    blocked: MissingInput materialId=stone_block available=0",
      "    blocked: Paused",
    ]);
  });

  it("prints deconstruction targets and the recently finished jobs", () => {
    const down = {
      ...site,
      kind: "Deconstruction",
      required: [],
      delivered: [],
      targetEntityId: 9,
    };
    const recent = [
      {
        jobId: 3,
        kind: "Construction",
        prototypeId: "wall",
        status: "done",
        mapId: 1,
        cellIndex: 5,
        finishedTick: 77,
      },
    ];
    expect(formatSites({ jobs: [down], recent })).toEqual([
      "#12 Deconstruction oven of #9 at 1:326: supplying, priority 50, supplier #4",
      "  finished #3 Construction wall at 1:5: done at tick 77",
    ]);
  });

  it("says so when nothing is queued and ignores other data", () => {
    expect(formatSites({ jobs: [], recent: [] })).toEqual(["no construction jobs"]);
    expect(formatSites(null)).toEqual([]);
  });
});

describe("placementRefusal and formatPlacement", () => {
  const base = { prototypeId: "table", mapId: 1, cellIndex: 20, zoneId: null };

  it("prints ok for a valid placement, with the zone when there is one", () => {
    expect(formatPlacement({ ...base, valid: true, reasons: [] })).toEqual(["table at 1:20: ok"]);
    expect(formatPlacement({ ...base, valid: true, reasons: [], zoneId: 8 })).toEqual([
      "table at 1:20: ok (zone #8)",
    ]);
    expect(placementRefusal({ ...base, valid: true, reasons: [] })).toBeNull();
  });

  it("prints the reasons of a refused placement", () => {
    const refused = {
      ...base,
      valid: false,
      reasons: [
        { kind: "TierLocked", text: "Unlocks at Village" },
        { kind: "Occupied", text: "chest stands here" },
      ],
    };
    const text = "table at 1:20: TierLocked (Unlocks at Village), Occupied (chest stands here)";
    expect(placementRefusal(refused)).toBe(text);
    expect(formatPlacement(refused)).toEqual([text]);
    expect(formatPlacement(3)).toEqual([]);
    expect(placementRefusal(3)).toBeNull();
  });
});

describe("formatBuildMenu", () => {
  it("prints materials, ticks and the lock text", () => {
    expect(
      formatBuildMenu([
        {
          id: "oven",
          materials: [{ materialId: "stone_block", quantity: 6 }],
          constructionTicks: 48,
          locked: true,
          unlockText: "Unlocks at Village",
        },
        {
          id: "door",
          materials: [
            { materialId: "oak_plank", quantity: 2 },
            { materialId: "nails", quantity: 2 },
          ],
          constructionTicks: 12,
          locked: false,
          unlockText: null,
        },
      ]),
    ).toEqual([
      "oven: stone_block 6; 48 ticks [Unlocks at Village]",
      "door: oak_plank 2, nails 2; 12 ticks",
    ]);
    expect(formatBuildMenu("x")).toEqual([]);
  });
});
