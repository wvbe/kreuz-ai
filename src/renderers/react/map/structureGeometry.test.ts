import { describe, expect, it } from "vitest";
import {
  createBellRingGeometry,
  createBellTowerGeometry,
  createDwellingGeometry,
  createRiskFlagGeometry,
  dwellingModels,
} from "./structureGeometry";

function height(geometry: ReturnType<typeof createDwellingGeometry>): number {
  geometry.computeBoundingBox();
  return geometry.boundingBox?.max.y ?? 0;
}

describe("structureGeometry", () => {
  // @covers 024:FR-042
  it("gives each dwelling level its own model, growing from hovel to burgher house", () => {
    expect(dwellingModels.map((model) => model.level)).toEqual([
      "hovel",
      "cottage",
      "timber_framed_house",
      "burgher_house",
    ]);
    const geometries = dwellingModels.map((model) => createDwellingGeometry(model.level));
    const vertexCounts = geometries.map((geometry) => geometry.getAttribute("position").count);
    expect(new Set(vertexCounts).size).toBe(4);
    const heights = geometries.map(height);
    expect([...heights].sort((first, second) => first - second)).toEqual(heights);
    expect(new Set(dwellingModels.map((model) => model.color)).size).toBe(4);
  });

  it("falls back to the hovel for a level it does not know", () => {
    expect(createDwellingGeometry("palace").getAttribute("position").count).toBe(
      createDwellingGeometry("hovel").getAttribute("position").count,
    );
  });

  // @covers 024:FR-033
  it("builds the tower, its ring and the at-risk flag above the ground", () => {
    for (const geometry of [
      createBellTowerGeometry(),
      createBellRingGeometry(),
      createRiskFlagGeometry(),
    ]) {
      expect(geometry.getAttribute("position").count).toBeGreaterThan(0);
      expect(height(geometry)).toBeGreaterThan(0.5);
    }
  });
});
