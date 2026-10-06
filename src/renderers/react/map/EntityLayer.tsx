import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, Matrix4, Vector3 } from "three";
import type { BufferGeometry, InstancedMesh } from "three";
import type { MapEntityView } from "../../../game/api/Views";
import { visibleGroundBounds } from "./cameraMath";
import type { CameraState, Viewport } from "./cameraMath";
import { DoorLayer } from "./DoorLayer";
import { createCropGeometry, createVisualGeometry } from "./entityGeometry";
import { VisualKind, visualKinds } from "./entityVisuals";
import { layoutCrops, layoutEntities } from "./instanceLayout";
import type { CropCell } from "./instanceLayout";
import type { MapScene } from "./mapScene";

const scratch = new Matrix4();
const tint = new Color();
const size = new Vector3();

function capacityFor(count: number): number {
  let capacity = 64;
  while (capacity < count) {
    capacity *= 2;
  }
  return capacity;
}

type Placed = { x: number; y: number; z: number; rotation: number; scale: number; color: number };

function InstancedGroup(props: {
  name: string;
  geometry: BufferGeometry;
  items: readonly Placed[];
}) {
  const mesh = useRef<InstancedMesh>(null);
  const capacity = capacityFor(props.items.length);
  useLayoutEffect(() => {
    const target = mesh.current;
    if (target === null) {
      return;
    }
    for (const [index, item] of props.items.entries()) {
      scratch.makeRotationY(item.rotation);
      scratch.scale(size.set(item.scale, item.scale, item.scale));
      scratch.setPosition(item.x, item.y, item.z);
      target.setMatrixAt(index, scratch);
      target.setColorAt(index, tint.setHex(item.color));
    }
    target.count = props.items.length;
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor !== null) {
      target.instanceColor.needsUpdate = true;
    }
  }, [props.items]);
  return (
    <instancedMesh
      key={capacity}
      ref={mesh}
      name={props.name}
      args={[props.geometry, undefined, capacity]}
      frustumCulled={false}
    >
      <meshStandardMaterial />
    </instancedMesh>
  );
}

/**
 * Entities and crops as instanced primitives, one draw call per visual kind (spec 024 FR-004;
 * performance on 64x64 maps). Only what lies in the visible ground is laid out (culling).
 *
 * @param props - The scene, the camera and the entities.
 * @returns The three.js elements.
 */
export function EntityLayer(props: {
  scene: MapScene;
  camera: CameraState;
  viewport: Viewport;
  entities: readonly MapEntityView[];
  crops: readonly CropCell[];
}) {
  const geometries = useMemo(
    () => new Map(visualKinds.map((kind) => [kind, createVisualGeometry(kind)])),
    [],
  );
  const cropGeometry = useMemo(() => createCropGeometry(), []);
  const doorGeometry = geometries.get(VisualKind.Door);
  useEffect(
    () => () => {
      for (const geometry of geometries.values()) {
        geometry.dispose();
      }
      cropGeometry.dispose();
    },
    [geometries, cropGeometry],
  );
  const bounds = visibleGroundBounds(props.camera, props.viewport);
  const layout = useMemo(
    () => layoutEntities(props.entities, props.scene, bounds),
    [props.entities, props.scene, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ],
  );
  const kindItems = useMemo(
    () =>
      visualKinds
        .filter((kind) => kind !== VisualKind.Door)
        .map((kind) => ({
          kind,
          items: (layout.get(kind) ?? []).map((instance) => ({
            x: instance.x,
            y: instance.y,
            z: instance.z,
            rotation: instance.rotation,
            scale: 1,
            color: instance.color,
          })),
        })),
    [layout],
  );
  const plants = useMemo(
    () => layoutCrops(props.crops, props.scene, bounds),
    [props.crops, props.scene, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ],
  );
  const plantItems = useMemo(
    () =>
      plants.map((plant) => ({
        x: plant.x,
        y: 0.02,
        z: plant.z,
        rotation: 0,
        scale: plant.height,
        color: plant.color,
      })),
    [plants],
  );
  return (
    <group name="entities">
      {kindItems.map(({ kind, items }) => {
        const geometry = geometries.get(kind);
        return geometry === undefined || items.length === 0 ? null : (
          <InstancedGroup key={kind} name={kind} geometry={geometry} items={items} />
        );
      })}
      {doorGeometry === undefined ? null : (
        <DoorLayer doors={layout.get(VisualKind.Door) ?? []} geometry={doorGeometry} />
      )}
      {plantItems.length === 0 ? null : (
        <InstancedGroup name="crops" geometry={cropGeometry} items={plantItems} />
      )}
    </group>
  );
}
