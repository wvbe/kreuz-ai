import ReactThreeTestRenderer from "@react-three/test-renderer";
import { BoxGeometry, Matrix4 } from "three";
import type { InstancedMesh } from "three";
import { describe, expect, it } from "vitest";
import { doorOpenAngle, doorSwingStep, DoorLayer, nextDoorAngle } from "./DoorLayer";
import { VisualKind } from "./entityVisuals";
import type { VisualInstance } from "./instanceLayout";

function door(open: boolean): VisualInstance {
  return {
    entityId: 9,
    kind: VisualKind.Door,
    cell: 1,
    x: 2,
    y: 0,
    z: 3,
    rotation: 0,
    color: 0x8a5a2b,
    open,
  };
}

function swingOf(mesh: InstancedMesh): number {
  const matrix = new Matrix4();
  mesh.getMatrixAt(0, matrix);
  // the rotation about the vertical axis of the instance matrix: m13 = sin(angle)
  return Math.asin(matrix.elements[8] ?? 0);
}

describe("nextDoorAngle", () => {
  // @covers 024:FR-016
  it("opens by steps up to the open angle and closes the same way, never overshooting", () => {
    expect(nextDoorAngle(0, true)).toBeCloseTo(doorSwingStep);
    expect(nextDoorAngle(doorOpenAngle - 0.01, true)).toBe(doorOpenAngle);
    expect(nextDoorAngle(doorOpenAngle, true)).toBe(doorOpenAngle);
    expect(nextDoorAngle(doorOpenAngle, false)).toBeCloseTo(doorOpenAngle - doorSwingStep);
    expect(nextDoorAngle(0.01, false)).toBe(0);
  });
});

describe("DoorLayer", () => {
  // @covers 024:FR-016
  it("swings a door open while somebody stands in it and shut again afterwards", async () => {
    const geometry = new BoxGeometry(1, 1, 0.1);
    const renderer = await ReactThreeTestRenderer.create(
      <DoorLayer doors={[door(false)]} geometry={geometry} />,
    );
    const mesh = renderer.scene.children[0]?.instance as InstancedMesh;
    expect(mesh.name).toBe("door");
    expect(mesh.count).toBe(1);
    const closed = swingOf(mesh);
    await renderer.update(<DoorLayer doors={[door(true)]} geometry={geometry} />);
    await renderer.advanceFrames(12, 0.016);
    const open = swingOf(mesh);
    expect(open).toBeGreaterThan(closed + 1);
    await renderer.update(<DoorLayer doors={[door(false)]} geometry={geometry} />);
    await renderer.advanceFrames(12, 0.016);
    expect(swingOf(mesh)).toBeLessThan(0.1);
    await renderer.unmount();
    geometry.dispose();
  });

  it("draws nothing without doors", async () => {
    const geometry = new BoxGeometry(1, 1, 0.1);
    const renderer = await ReactThreeTestRenderer.create(
      <DoorLayer doors={[]} geometry={geometry} />,
    );
    expect(renderer.scene.children).toHaveLength(0);
    await renderer.unmount();
    geometry.dispose();
  });
});
