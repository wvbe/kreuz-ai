import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { Color, Matrix4, Vector3 } from "three";
import type { BufferGeometry, InstancedMesh } from "three";
import type { MapEntityView } from "../../../game/api/Views";
import { visibleGroundBounds } from "./cameraMath";
import type { CameraState, Viewport } from "./cameraMath";
import { DoorLayer } from "./DoorLayer";
import { interpolatePosition, tickProgress } from "./entityMotion";
import type { TickMotion } from "./entityMotion";
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

type Placed = {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  color: number;
  /**
   * Where the item stood one tick ago; it is drawn between there and (x, z) while the tick runs.
   */
  fromX?: number;
  fromZ?: number;
};

/**
 * The state of the interpolation, shared by all instanced groups: when the current tick arrived
 * on the three.js clock, and how long a tick lasts.
 */
type MotionClock = { startedAt: number; tickMs: number; paused: boolean };

function InstancedGroup(props: {
  name: string;
  geometry: BufferGeometry;
  items: readonly Placed[];
  motion?: MutableRefObject<MotionClock>;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const lastProgress = useRef(-1);
  const capacity = capacityFor(props.items.length);
  const write = (progress: number) => {
    const target = mesh.current;
    if (target === null) {
      return;
    }
    for (const [index, item] of props.items.entries()) {
      const drawn = interpolatePosition(
        item.fromX === undefined || item.fromZ === undefined
          ? undefined
          : { x: item.fromX, z: item.fromZ },
        { x: item.x, z: item.z },
        progress,
      );
      scratch.makeRotationY(item.rotation);
      scratch.scale(size.set(item.scale, item.scale, item.scale));
      scratch.setPosition(drawn.x, item.y, drawn.z);
      target.setMatrixAt(index, scratch);
      target.setColorAt(index, tint.setHex(item.color));
    }
    target.count = props.items.length;
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor !== null) {
      target.instanceColor.needsUpdate = true;
    }
  };
  const clock = useThree((state) => state.clock);
  const progressNow = () => {
    const motion = props.motion?.current;
    return motion === undefined
      ? 1
      : tickProgress(clock.elapsedTime - motion.startedAt, motion.tickMs, motion.paused);
  };
  useLayoutEffect(() => {
    const progress = progressNow();
    lastProgress.current = progress;
    write(progress);
  }, [props.items]);
  useFrame((state) => {
    if (props.motion === undefined) {
      return;
    }
    const progress = progressNow();
    if (progress !== lastProgress.current) {
      lastProgress.current = progress;
      write(progress);
    }
    if (progress < 1) {
      state.invalidate();
    }
  });
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
 * performance on 64x64 maps). Only what lies in the visible ground is laid out (culling). With a
 * `motion` clock, entities that moved one cell since the previous tick are drawn sliding from the
 * old cell centre to the new one over the real tick interval (cosmetic only; paused or a long
 * jump snaps).
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
  /**
   * The tick clock; without it entities are drawn on their cells (no interpolation).
   */
  motion?: TickMotion;
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
  const clock = useThree((state) => state.clock);
  const cells = useRef({
    mapId: -1,
    tick: -1,
    previous: new Map<number, number>(),
    current: new Map<number, number>(),
  });
  const motionClock = useRef<MotionClock>({ startedAt: 0, tickMs: 0, paused: true });
  const mobile = useMemo(() => {
    const where = new Map<number, number>();
    for (const instances of layout.values()) {
      for (const instance of instances) {
        where.set(instance.entityId, instance.cell);
      }
    }
    return where;
  }, [layout]);
  // A new tick on the same map: what stood where is the previous placing; a new map or the first
  // tick has no previous (snap).
  if (props.motion !== undefined) {
    const known = cells.current;
    if (known.mapId !== props.scene.mapId) {
      known.mapId = props.scene.mapId;
      known.previous = new Map();
      known.current = mobile;
      known.tick = props.motion.tick;
    } else if (known.tick !== props.motion.tick) {
      known.previous = known.current;
      known.current = mobile;
      known.tick = props.motion.tick;
      motionClock.current.startedAt = clock.getElapsedTime();
    } else {
      known.current = mobile;
    }
    motionClock.current.tickMs = props.motion.tickMs;
    motionClock.current.paused = props.motion.paused;
  }
  const motionRef = props.motion === undefined ? undefined : motionClock;
  const kindItems = useMemo(
    () =>
      visualKinds
        .filter((kind) => kind !== VisualKind.Door)
        .map((kind) => ({
          kind,
          items: (layout.get(kind) ?? []).map((instance): Placed => {
            const before = cells.current.previous.get(instance.entityId);
            const from = before === undefined ? undefined : props.scene.centers[before];
            const centre = props.scene.centers[instance.cell];
            return {
              x: instance.x,
              y: instance.y,
              z: instance.z,
              rotation: instance.rotation,
              scale: 1,
              color: instance.color,
              fromX:
                from === undefined || centre === undefined
                  ? undefined
                  : from.x + (instance.x - centre.x),
              fromZ:
                from === undefined || centre === undefined
                  ? undefined
                  : from.z + (instance.z - centre.z),
            };
          }),
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
          <InstancedGroup
            key={kind}
            name={kind}
            geometry={geometry}
            items={items}
            motion={motionRef}
          />
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
