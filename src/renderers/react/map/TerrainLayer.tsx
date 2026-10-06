import { useEffect, useMemo } from "react";
import { DoubleSide } from "three";
import { terrainColor } from "../prefs/terrainColors";
import { buildCellBuffers, buildOutlineBuffer } from "./cellBuffers";
import { geometryFromBuffers, lineGeometryFromPoints } from "./cellGeometry";
import type { MapScene } from "./mapScene";

/**
 * The ground: every cell of the map as one vertex-coloured mesh (a single draw call, whatever
 * the cell count) plus a faint outline so voronoi cells read as tiles.
 *
 * @param props - The scene.
 * @returns The three.js elements.
 */
export function TerrainLayer(props: { scene: MapScene }) {
  const { scene } = props;
  const ground = useMemo(
    () =>
      geometryFromBuffers(
        buildCellBuffers(scene, null, (cell) => terrainColor(scene.terrain[cell] ?? ""), 0, true),
      ),
    [scene],
  );
  const lines = useMemo(
    () => lineGeometryFromPoints(buildOutlineBuffer(scene, null, 0.005)),
    [scene],
  );
  useEffect(
    () => () => {
      ground.dispose();
      lines.dispose();
    },
    [ground, lines],
  );
  return (
    <group name="terrain">
      <mesh geometry={ground}>
        <meshStandardMaterial vertexColors side={DoubleSide} />
      </mesh>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color={0x000000} transparent opacity={0.18} />
      </lineSegments>
    </group>
  );
}
