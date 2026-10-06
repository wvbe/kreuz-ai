import { describe, expect, it } from "vitest";
import {
  cameraPose,
  clampToWorld,
  clampZoom,
  defaultCamera,
  isoPitch,
  maxZoom,
  minZoom,
  panByScreen,
  rotateBy,
  screenToGround,
  visibleGroundBounds,
  worldToScreen,
  zoomAt,
} from "./cameraMath";
import type { CameraState } from "./cameraMath";

const viewport = { width: 800, height: 600 };
const camera: CameraState = { centerX: 20, centerZ: 30, zoom: 24, rotation: 0.7 };

describe("cameraMath", () => {
  it("maps the centre of the view to the middle of the screen", () => {
    const screen = worldToScreen(camera, viewport, { x: 20, z: 30 });
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(300);
  });

  it("screenToGround inverts worldToScreen at any rotation", () => {
    for (const rotation of [0, 0.7, Math.PI / 2, 3, -1.2]) {
      const turned = { ...camera, rotation };
      const screen = worldToScreen(turned, viewport, { x: 11.5, z: 42.25 });
      const ground = screenToGround(turned, viewport, screen);
      expect(ground.x).toBeCloseTo(11.5);
      expect(ground.z).toBeCloseTo(42.25);
    }
  });

  it("raises a point on screen by its height", () => {
    const flat = worldToScreen(camera, viewport, { x: 22, z: 31 });
    const raised = worldToScreen(camera, viewport, { x: 22, z: 31 }, 2);
    expect(raised.x).toBeCloseTo(flat.x);
    expect(raised.y).toBeLessThan(flat.y);
  });

  it("agrees with the pose the three.js camera is given", () => {
    const pose = cameraPose(camera);
    const forward = pose.target.map((value, index) => value - (pose.position[index] ?? 0));
    const length = Math.hypot(...forward);
    const unit = forward.map((value) => value / length);
    // right = forward x up with up = (0, 1, 0)
    const rawRight = [-(unit[2] ?? 0), 0, unit[0] ?? 0];
    const rightLength = Math.hypot(...rawRight);
    const right = rawRight.map((value) => value / rightLength);
    const step = worldToScreen(camera, viewport, {
      x: camera.centerX + (right[0] ?? 0),
      z: camera.centerZ + (right[2] ?? 0),
    });
    expect(step.x).toBeCloseTo(400 + camera.zoom);
    expect(step.y).toBeCloseTo(300);
    expect(Math.asin(-(unit[1] ?? 0))).toBeCloseTo(isoPitch);
  });

  it("pans so the picture follows the pointer", () => {
    const point = { x: 25, z: 28 };
    const before = worldToScreen(camera, viewport, point);
    const moved = panByScreen(camera, 30, -12);
    const after = worldToScreen(moved, viewport, point);
    expect(after.x - before.x).toBeCloseTo(30);
    expect(after.y - before.y).toBeCloseTo(-12);
  });

  it("zooms around the pointer and clamps", () => {
    const anchor = { x: 600, y: 200 };
    const ground = screenToGround(camera, viewport, anchor);
    const zoomed = zoomAt(camera, viewport, 1.5, anchor);
    expect(zoomed.zoom).toBeCloseTo(36);
    const again = screenToGround(zoomed, viewport, anchor);
    expect(again.x).toBeCloseTo(ground.x);
    expect(again.z).toBeCloseTo(ground.z);
    expect(zoomAt(camera, viewport, 1000, anchor).zoom).toBe(maxZoom);
    expect(clampZoom(0.001)).toBe(minZoom);
  });

  it("rotates and clamps the centre into the world", () => {
    expect(rotateBy(camera, 0.5).rotation).toBeCloseTo(1.2);
    const clamped = clampToWorld({ ...camera, centerX: -5, centerZ: 99 }, { x: 64, z: 64 });
    expect(clamped.centerX).toBe(0);
    expect(clamped.centerZ).toBe(64);
  });

  it("fits the default camera to the map and bounds the visible ground", () => {
    const start = defaultCamera({ x: 64, z: 64 }, viewport);
    expect(start.centerX).toBe(32);
    expect(start.zoom).toBeGreaterThanOrEqual(minZoom);
    const bounds = visibleGroundBounds(start, viewport);
    expect(bounds.minX).toBeLessThan(32);
    expect(bounds.maxX).toBeGreaterThan(32);
    expect(bounds.minZ).toBeLessThan(bounds.maxZ);
  });
});
