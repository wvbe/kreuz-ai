import { useMemo } from "react";
import { useGame } from "../hooks/GameProvider";
import { type TileMap, TerrainType } from "@game/map/TileMap";
import type { Cell } from "@game/map/TileMap";
import { getEntitiesWithComponent, getComponent, hasTag } from "@game/engine/EntityManager";
import type { EntityId } from "@game/engine/EntityManager";
import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

const TERRAIN_COLORS: Record<string, string> = {
  [TerrainType.Grassland]: "#7ec850",
  [TerrainType.Forest]: "#2d6b1e",
  [TerrainType.Mountain]: "#8b7355",
  [TerrainType.Water]: "#4488cc",
  [TerrainType.DeepWater]: "#224488",
  [TerrainType.Desert]: "#e8d68a",
  [TerrainType.Marsh]: "#5a7a3a",
  [TerrainType.Snow]: "#f0f0f0",
  [TerrainType.Hills]: "#a0c070",
  [TerrainType.Farmland]: "#c8a850",
  [TerrainType.Road]: "#b8a080",
  [TerrainType.Stone]: "#999999",
  [TerrainType.Dirt]: "#a07040",
  [TerrainType.Sand]: "#f0e0a0",
};

type MapViewProps = {
  selectedEntityId: number | null;
  onSelectEntity: (entityId: number | null) => void;
};

/**
 * Renders the game map in 3D with terrain tiles and entities.
 */
export function MapView({ selectedEntityId, onSelectEntity }: MapViewProps) {
  const { instance } = useGame();
  const mainMap = instance.maps.get("main");

  if (!mainMap) return null;

  return (
    <>
      <OrbitControls
        makeDefault
        enableRotate={true}
        enablePan={true}
        enableZoom={true}
        maxZoom={30}
        minZoom={2}
        maxPolarAngle={Math.PI / 3}
        minPolarAngle={Math.PI / 6}
        screenSpacePanning={true}
        mouseButtons={{ LEFT: 2, MIDDLE: 1, RIGHT: 0 }}
      />
      <TerrainMesh map={mainMap} />
      <EntityMarkers selectedEntityId={selectedEntityId} onSelectEntity={onSelectEntity} />
    </>
  );
}

/**
 * Computes the half-distance to the nearest neighbor for each cell,
 * used as the tile radius so tiles don't overlap.
 */
function computeCellRadii(cells: Cell[]): number[] {
  const radii: number[] = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    let minDist = Infinity;
    for (const neighborId of cell.adjacentCells) {
      const neighbor = cells[neighborId];
      if (!neighbor) continue;
      const dx = cell.centerX - neighbor.centerX;
      const dy = cell.centerY - neighbor.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) minDist = dist;
    }
    // Use half the distance to nearest neighbor so tiles meet but don't overlap
    radii[i] = minDist === Infinity ? 1 : minDist * 0.52;
  }
  return radii;
}

/**
 * Renders terrain as a single merged BufferGeometry for performance.
 * Each Voronoi cell is rendered as a hexagonal prism sized to its local density.
 */
function TerrainMesh({ map }: { map: TileMap }) {
  const geometry = useMemo(() => {
    const cellRadii = computeCellRadii(map.cells);
    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    for (let i = 0; i < map.cells.length; i++) {
      const cell = map.cells[i]!;
      const radius = cellRadii[i]!;
      const colorHex = TERRAIN_COLORS[cell.terrain] ?? "#888888";
      const color = new THREE.Color(colorHex);
      const y =
        cell.terrain === TerrainType.Water || cell.terrain === TerrainType.DeepWater
          ? 0.05
          : cell.elevation * 3 + 0.15;
      const height = 0.3 + cell.elevation * 2;
      const halfH = height / 2;
      const sides = 6;

      // Top face center
      const topCenter = vertexOffset;
      positions.push(cell.centerX, y + halfH, cell.centerY);
      colors.push(color.r, color.g, color.b);
      vertexOffset++;

      // Top face ring
      for (let s = 0; s < sides; s++) {
        const angle = (s / sides) * Math.PI * 2 + Math.PI / 6;
        positions.push(
          cell.centerX + Math.cos(angle) * radius,
          y + halfH,
          cell.centerY + Math.sin(angle) * radius,
        );
        colors.push(color.r, color.g, color.b);
        vertexOffset++;
      }

      // Top face triangles (CCW winding for upward-facing normal)
      for (let s = 0; s < sides; s++) {
        indices.push(topCenter, topCenter + 1 + ((s + 1) % sides), topCenter + 1 + s);
      }
    }

    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    merged.setIndex(indices);
    merged.computeVertexNormals();
    return merged;
  }, [map]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * Renders entities as 3D markers on the map.
 */
function EntityMarkers({
  selectedEntityId,
  onSelectEntity,
}: {
  selectedEntityId: number | null;
  onSelectEntity: (entityId: number | null) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { instance, tick } = useGame();
  const mainMap = instance.maps.get("main");

  const entities = useMemo(() => {
    const positionEntities = getEntitiesWithComponent(instance.state.entities, "position");
    return positionEntities
      .map((entityId) => {
        const position = getComponent(instance.state.entities, entityId, "position");
        const identity = getComponent(instance.state.entities, entityId, "identity");
        const isColonist = hasTag(instance.state.entities, entityId, "colonist");
        const isAnimal = hasTag(instance.state.entities, entityId, "animal");
        const isStructure = hasTag(instance.state.entities, entityId, "structure");

        if (!position || !mainMap) return null;
        const cell = mainMap.cells[position.cellId as number];
        if (!cell) return null;

        return {
          entityId,
          x: cell.centerX,
          z: cell.centerY,
          y: cell.elevation * 3 + 1,
          name: ((identity as Record<string, unknown>)?.name as string) ?? "Entity",
          isColonist,
          isAnimal,
          isStructure,
        };
      })
      .filter(Boolean) as Array<{
      entityId: EntityId;
      x: number;
      z: number;
      y: number;
      name: string;
      isColonist: boolean;
      isAnimal: boolean;
      isStructure: boolean;
    }>;
    // tick is used to trigger recomputation each game tick
  }, [instance, mainMap, tick]);

  return (
    <group>
      {entities.map((entity) => {
        const isSelected = entity.entityId === selectedEntityId;
        let color = "#ffffff";
        let scale = 0.4;

        if (entity.isColonist) {
          color = isSelected ? "#ffff00" : "#ff6b6b";
          scale = 0.5;
        } else if (entity.isAnimal) {
          color = isSelected ? "#ffff00" : "#66bb6a";
          scale = 0.35;
        } else if (entity.isStructure) {
          color = isSelected ? "#ffff00" : "#ab47bc";
          scale = 0.6;
        }

        return (
          <mesh
            key={entity.entityId}
            position={[entity.x, entity.y, entity.z]}
            scale={isSelected ? scale * 1.5 : scale}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onSelectEntity(entity.entityId);
            }}
          >
            {entity.isColonist ? (
              <capsuleGeometry args={[0.3, 0.8, 4, 8]} />
            ) : entity.isAnimal ? (
              <sphereGeometry args={[0.5, 8, 8]} />
            ) : (
              <boxGeometry args={[1, 1, 1]} />
            )}
            <meshStandardMaterial
              color={color}
              emissive={isSelected ? "#ffff00" : "#000000"}
              emissiveIntensity={isSelected ? 0.5 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}
