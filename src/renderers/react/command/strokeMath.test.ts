import { describe, expect, it } from "vitest";
import { squareScene } from "../testing/testScenes";
import { appendStrokeCell, cellsInRect, extendStroke, StrokeMode } from "./strokeMath";

const scene = squareScene(10, 10);

describe("appendStrokeCell", () => {
  it("keeps each cell once in first-touched order and ignores the off-map pointer", () => {
    let stroke: readonly number[] = [];
    for (const cell of [5, 6, 5, null, 16]) {
      stroke = appendStrokeCell(stroke, cell);
    }
    expect(stroke).toEqual([5, 6, 16]);
  });

  it("returns the same array when nothing changes", () => {
    const stroke = [3];
    expect(appendStrokeCell(stroke, 3)).toBe(stroke);
    expect(appendStrokeCell(stroke, null)).toBe(stroke);
  });
});

describe("cellsInRect", () => {
  it("selects the block between two corners whichever way it was dragged", () => {
    const forward = cellsInRect(scene.centers, 11, 23);
    expect(forward).toEqual([11, 12, 13, 21, 22, 23]);
    expect(cellsInRect(scene.centers, 23, 11)).toEqual(forward);
  });

  it("is one cell for a click and a line for a thin drag", () => {
    expect(cellsInRect(scene.centers, 44, 44)).toEqual([44]);
    expect(cellsInRect(scene.centers, 40, 45)).toEqual([40, 41, 42, 43, 44, 45]);
  });

  it("is empty for an unknown corner", () => {
    expect(cellsInRect(scene.centers, 4, 9999)).toEqual([]);
  });
});

describe("extendStroke", () => {
  it("paints along the pointer and grows a rectangle from the start", () => {
    expect(extendStroke(StrokeMode.Paint, 5, [5], scene.centers, 6)).toEqual([5, 6]);
    expect(extendStroke(StrokeMode.Rectangle, 11, [11], scene.centers, 22)).toEqual([
      11, 12, 21, 22,
    ]);
    const stroke = [11];
    expect(extendStroke(StrokeMode.Rectangle, 11, stroke, scene.centers, null)).toBe(stroke);
  });
});
