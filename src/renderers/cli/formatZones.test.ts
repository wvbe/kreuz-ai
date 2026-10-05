import { describe, expect, it } from "vitest";
import { formatZone, formatZoneList } from "./formatZones";

const base = {
  id: 12,
  zoneTypeId: "bakery",
  mapId: 1,
  tiles: [22, 23, 32, 33],
  isRoom: true,
  active: false,
  status: "incomplete",
  gaps: [
    { kind: "missing-furniture", requirement: "1x tag:oven", required: 1, present: 0 },
    { kind: "missing-job-board", requirement: null, required: 1, present: 0 },
  ],
  filter: null,
  createdTick: 3,
  affinity: 0,
  workers: [],
};

describe("formatZoneList", () => {
  it("prints one line per zone with the first gap", () => {
    expect(
      formatZoneList([
        base,
        {
          ...base,
          id: 13,
          zoneTypeId: "stockpile",
          isRoom: false,
          active: true,
          status: "active",
          gaps: [],
        },
      ]),
    ).toEqual([
      "#12 bakery on map 1: incomplete, 4 tiles, room (missing furniture 1x tag:oven: 0 of 1)",
      "#13 stockpile on map 1: active, 4 tiles",
    ]);
  });

  it("says when there are no zones and ignores foreign data", () => {
    expect(formatZoneList([])).toEqual(["no zones"]);
    expect(formatZoneList("x")).toEqual([]);
  });
});

describe("formatZone", () => {
  it("prints the details with every gap", () => {
    expect(formatZone(base)).toEqual([
      "zone #12 bakery on map 1: incomplete (room), created tick 3",
      "  tiles (4): 22 23 32 33",
      "  storage filter: accepts all",
      "  workers: none (affinity 0)",
      "  gap: missing furniture 1x tag:oven: 0 of 1",
      "  gap: missing a job board",
    ]);
  });

  it("describes sizes, enclosure, filters and workers", () => {
    const lines = formatZone({
      ...base,
      gaps: [
        { kind: "too-small", requirement: null, required: 4, present: 2 },
        { kind: "not-enclosed", requirement: null, required: null, present: null },
        { kind: "odd", requirement: null, required: null, present: null },
      ],
      filter: { categories: ["food"], materialIds: ["oak_log"] },
      workers: [5, 6],
      affinity: 3,
      isRoom: false,
    });
    expect(lines).toContain("  gap: too small: 2 of 4 tiles");
    expect(lines).toContain("  gap: not enclosed by walls and doors");
    expect(lines).toContain("  gap: odd");
    expect(lines).toContain("  storage filter: accepts food, oak_log");
    expect(lines).toContain("  workers: #5 #6 (affinity 3)");
  });

  it("prints no gaps for an active zone and ignores foreign data", () => {
    expect(formatZone({ ...base, gaps: [], status: "active", active: true })).toContain(
      "  gaps: none",
    );
    expect(formatZone(null)).toEqual([]);
  });
});
