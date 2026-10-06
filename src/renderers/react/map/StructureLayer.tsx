import { useEffect, useMemo } from "react";
import {
  createBellRingGeometry,
  createBellTowerGeometry,
  createDwellingGeometry,
  createRiskFlagGeometry,
  dwellingModels,
} from "./structureGeometry";
import type { ZoneOverlay } from "./MapCanvasProps";
import type { MapScene } from "./mapScene";

/**
 * The models that stand on zones (spec 024 FR-004, FR-033, FR-042, FR-044): the dwelling model of
 * the level of every dwelling zone (it swaps when the level changes, because the zones are read
 * again after every tick), a red pennant over a dwelling whose downgrade streak runs, and the
 * Bell Tower with a ring around it for a moment after the bell rang. A model stands on the first
 * cell of its zone.
 *
 * @param props - The scene and the zones (those without a `structure` draw nothing here).
 * @returns The three.js elements.
 */
export function StructureLayer(props: { scene: MapScene; zones: readonly ZoneOverlay[] }) {
  const geometries = useMemo(
    () => ({
      dwellings: new Map(
        dwellingModels.map((model) => [model.level, createDwellingGeometry(model.level)]),
      ),
      tower: createBellTowerGeometry(),
      ring: createBellRingGeometry(),
      flag: createRiskFlagGeometry(),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const geometry of geometries.dwellings.values()) {
        geometry.dispose();
      }
      geometries.tower.dispose();
      geometries.ring.dispose();
      geometries.flag.dispose();
    },
    [geometries],
  );
  return (
    <group name="structures">
      {props.zones.map((zone) => {
        const structure = zone.structure;
        const cell = zone.cells[0];
        const center = cell === undefined ? undefined : props.scene.centers[cell];
        if (structure === undefined || center === undefined) {
          return null;
        }
        const dwelling = dwellingModels.find((entry) => entry.level === structure.dwellingLevel);
        return (
          <group key={zone.zoneId} position={[center.x, 0, center.z]}>
            {dwelling === undefined ? null : (
              <mesh
                name={`dwelling-${zone.zoneId}`}
                userData={{ level: dwelling.level }}
                geometry={geometries.dwellings.get(dwelling.level)}
              >
                <meshStandardMaterial color={dwelling.color} />
              </mesh>
            )}
            {structure.atRisk ? (
              <mesh name={`at-risk-${zone.zoneId}`} geometry={geometries.flag}>
                <meshStandardMaterial color={0xd23a3a} />
              </mesh>
            ) : null}
            {structure.bellTower ? (
              <mesh name={`bell-tower-${zone.zoneId}`} geometry={geometries.tower}>
                <meshStandardMaterial color={0x9b978e} />
              </mesh>
            ) : null}
            {structure.bellTower && structure.ringing ? (
              <mesh name={`bell-ring-${zone.zoneId}`} geometry={geometries.ring}>
                <meshBasicMaterial color={0xffd23f} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}
