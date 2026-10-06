import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { zoneColor } from "../prefs/terrainColors";
import { buildCellBuffers, buildOutlineBuffer } from "./cellBuffers";
import { geometryFromBuffers, lineGeometryFromPoints } from "./cellGeometry";
import type { PlacementGhost, ZoneOverlay } from "./MapCanvasProps";
import type { MapScene } from "./mapScene";

function ZoneTint(props: { scene: MapScene; zone: ZoneOverlay }) {
  const geometry = useMemo(
    () =>
      geometryFromBuffers(
        buildCellBuffers(
          props.scene,
          props.zone.cells,
          () => zoneColor(props.zone.zoneTypeId),
          0.02,
        ),
      ),
    [props.scene, props.zone],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} name={`zone-${props.zone.zoneId}`}>
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={props.zone.active ? 0.38 : 0.18}
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function CellOutline(props: { scene: MapScene; cell: number; color: number; name: string }) {
  const geometry = useMemo(
    () => lineGeometryFromPoints(buildOutlineBuffer(props.scene, [props.cell], 0.05)),
    [props.scene, props.cell],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} name={props.name}>
      <lineBasicMaterial color={props.color} />
    </lineSegments>
  );
}

function GhostCell(props: { scene: MapScene; ghost: PlacementGhost }) {
  const color = props.ghost.valid ? 0x3fbf5f : 0xd94040;
  const geometry = useMemo(
    () => geometryFromBuffers(buildCellBuffers(props.scene, [props.ghost.cell], () => color, 0.03)),
    [props.scene, props.ghost.cell, color],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const center = props.scene.centers[props.ghost.cell];
  return (
    <group name="placement-ghost">
      <mesh geometry={geometry}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.55}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {center === undefined ? null : (
        <mesh position={[center.x, 0.3, center.z]}>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial color={color} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

/**
 * The flat overlays above the ground: zone tints (spec 024 FR-004), the hover and selection
 * outlines and the placement ghost (green when `validate-placement` accepts the cell, red when
 * not, FR-014).
 *
 * @param props - The scene and what to overlay.
 * @returns The three.js elements.
 */
export function OverlayLayer(props: {
  scene: MapScene;
  zones: readonly ZoneOverlay[];
  showZones: boolean;
  hoverCell: number | null;
  selectedCell: number | null;
  ghost: PlacementGhost | null;
}) {
  return (
    <group name="overlays">
      {props.showZones
        ? props.zones.map((zone) => <ZoneTint key={zone.zoneId} scene={props.scene} zone={zone} />)
        : null}
      {props.hoverCell === null ? null : (
        <CellOutline scene={props.scene} cell={props.hoverCell} color={0xffffff} name="hover" />
      )}
      {props.selectedCell === null ? null : (
        <CellOutline
          scene={props.scene}
          cell={props.selectedCell}
          color={0xffd23f}
          name="selected"
        />
      )}
      {props.ghost === null ? null : <GhostCell scene={props.scene} ghost={props.ghost} />}
    </group>
  );
}
