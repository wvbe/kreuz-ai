import { describe, expect, it } from "vitest";
import { createCropGeometry, createVisualGeometry } from "./entityGeometry";
import { visualKinds } from "./entityVisuals";

describe("entityGeometry", () => {
  it("builds a non-empty primitive for every visual kind", () => {
    for (const kind of visualKinds) {
      const geometry = createVisualGeometry(kind);
      expect(geometry.getAttribute("position").count).toBeGreaterThan(0);
      geometry.computeBoundingBox();
      expect(geometry.boundingBox?.min.y).toBeGreaterThanOrEqual(-0.001);
      geometry.dispose();
    }
  });

  it("keeps the kinds distinct", () => {
    const counts = new Set(
      visualKinds.map((kind) => createVisualGeometry(kind).getAttribute("position").count),
    );
    expect(counts.size).toBeGreaterThan(3);
  });

  it("builds a crop plant of unit height", () => {
    const geometry = createCropGeometry();
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.max.y).toBeCloseTo(1);
  });
});
