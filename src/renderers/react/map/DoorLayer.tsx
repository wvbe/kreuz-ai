import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { Color, Matrix4 } from "three";
import type { BufferGeometry, InstancedMesh } from "three";
import type { VisualInstance } from "./instanceLayout";

/**
 * How far a door leaf swings when it is open, in radians.
 */
export const doorOpenAngle = Math.PI / 2;

/**
 * Radians a door leaf turns per rendered frame while it opens or closes.
 */
export const doorSwingStep = 0.2;

/**
 * One frame of a door swinging toward its open or closed angle.
 *
 * @param current - The angle of the leaf now, 0 (closed) to {@link doorOpenAngle}.
 * @param open - Whether somebody stands in the doorway.
 * @returns The angle of the next frame, never overshooting the target.
 */
export function nextDoorAngle(current: number, open: boolean): number {
  const target = open ? doorOpenAngle : 0;
  if (current < target) {
    return Math.min(target, current + doorSwingStep);
  }
  return Math.max(target, current - doorSwingStep);
}

function capacityFor(count: number): number {
  let capacity = 16;
  while (capacity < count) {
    capacity *= 2;
  }
  return capacity;
}

const scratch = new Matrix4();
const tint = new Color();

/**
 * The doors of a map as one instanced mesh whose leaves swing open while an entity stands in the
 * doorway and swing shut when it has gone (spec 024 FR-016). The angles live in a ref and are
 * advanced every frame; the canvas renders on demand, so the layer asks for another frame while a
 * leaf still moves.
 *
 * @param props - The door instances (kind `Door`) and the leaf geometry.
 * @returns The three.js element, or nothing without doors.
 */
export function DoorLayer(props: { doors: readonly VisualInstance[]; geometry: BufferGeometry }) {
  const mesh = useRef<InstancedMesh>(null);
  const angles = useRef(new Map<number, number>());
  const capacity = capacityFor(props.doors.length);

  function write(): boolean {
    const target = mesh.current;
    if (target === null) {
      return false;
    }
    let moving = false;
    for (const [index, door] of props.doors.entries()) {
      const known = angles.current.get(door.entityId);
      const current = known ?? (door.open ? doorOpenAngle : 0);
      const next = nextDoorAngle(current, door.open);
      moving = moving || next !== (door.open ? doorOpenAngle : 0);
      angles.current.set(door.entityId, next);
      scratch.makeRotationY(door.rotation + next);
      scratch.setPosition(door.x, door.y, door.z);
      target.setMatrixAt(index, scratch);
      target.setColorAt(index, tint.setHex(door.color));
    }
    target.count = props.doors.length;
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor !== null) {
      target.instanceColor.needsUpdate = true;
    }
    return moving;
  }

  useLayoutEffect(() => {
    write();
  }, [props.doors]);

  useFrame((state) => {
    if (write()) {
      state.invalidate();
    }
  });

  return props.doors.length === 0 ? null : (
    <instancedMesh
      key={capacity}
      ref={mesh}
      name="door"
      args={[props.geometry, undefined, capacity]}
      frustumCulled={false}
    >
      <meshStandardMaterial />
    </instancedMesh>
  );
}
