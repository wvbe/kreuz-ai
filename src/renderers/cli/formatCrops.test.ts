import { describe, expect, it } from "vitest";
import { formatCrops } from "./formatCrops";

const cell = {
  zoneId: 10,
  mapId: 1,
  cellIndex: 22,
  materialId: "wheat",
  stage: "Fallow",
  growthPermille: 0,
  ticksToRipe: null,
};

describe("formatCrops", () => {
  it("prints a summary per field and a line per cell with growth", () => {
    expect(
      formatCrops([
        cell,
        { ...cell, cellIndex: 23, stage: "Sown", growthPermille: 505, ticksToRipe: 428 },
        { ...cell, cellIndex: 32, stage: "Ripe", growthPermille: 1000, ticksToRipe: null },
      ]),
    ).toEqual([
      "field #10: 3 cells, 1 fallow, 1 sown, 1 ripe",
      "  1:22 wheat Fallow",
      "  1:23 wheat Sown, 50%, ripe in 428 ticks",
      "  1:32 wheat Ripe, 100%",
    ]);
  });

  it("says when there are no crop cells and ignores foreign data", () => {
    expect(formatCrops([])).toEqual([
      "no crop cells (designate a farm_field zone over fertile soil)",
    ]);
    expect(formatCrops("x")).toEqual([]);
  });
});
