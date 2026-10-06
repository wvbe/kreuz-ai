import { describe, expect, it } from "vitest";
import { squareScene } from "../testing/testScenes";
import { buildCellBuffers, buildOutlineBuffer } from "./cellBuffers";
import { geometryFromBuffers, lineGeometryFromPoints } from "./cellGeometry";

describe("cellGeometry", () => {
  it("builds an indexed coloured geometry", () => {
    const scene = squareScene(3, 3);
    const geometry = geometryFromBuffers(buildCellBuffers(scene, null, () => 0xff0000, 0));
    expect(geometry.getAttribute("position").count).toBe(36);
    expect(geometry.getAttribute("color").count).toBe(36);
    expect(geometry.getIndex()?.count).toBe(9 * 6);
    expect(geometry.boundingSphere).not.toBeNull();
  });

  it("builds a line geometry", () => {
    const scene = squareScene(2, 2);
    const geometry = lineGeometryFromPoints(buildOutlineBuffer(scene, [0], 0.1));
    expect(geometry.getAttribute("position").count).toBe(8);
  });
});
