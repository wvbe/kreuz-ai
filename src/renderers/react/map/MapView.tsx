import React, { useMemo, useState, useCallback } from "react";
import { useGame } from "../hooks/GameProvider.js";
import { type TileMap, TerrainType, type Cell } from "@game/map/TileMap.js";
import { getEntitiesWithComponent, getComponent, hasTag } from "@game/engine/EntityManager.js";
import type { EntityId } from "@game/engine/EntityManager.js";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
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
  const { instance, tick } = useGame();
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
      />
      <TerrainMesh map={mainMap} />
      <EntityMarkers
        selectedEntityId={selectedEntityId}
        onSelectEntity={onSelectEntity}
      />
    </>
  );
}

/**
 * Renders terrain as a colored point cloud / hex-like tiles.
 */
function TerrainMesh({ map }: { map: TileMap }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const cell of map.cells) {
      const x = cell.centerX;
      const z = cell.centerY;
      const y = cell.elevation * 5;

      positions.push(x, y, z);

      const colorHex = TERRAIN_COLORS[cell.terrain] ?? "#888888";
      const color = new THREE.Color(colorHex);
      colors.push(color.r, color.g, color.b);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [map]);

  // Render as instanced hexagonal tiles
  const tileGeometry = useMemo(() => new THREE.CylinderGeometry(0.8, 0.8, 0.3, 6), []);

  return (
    <group>
      {map.cells.map((cell) => {
        const colorHex = TERRAIN_COLORS[cell.terrain] ?? "#888888";
        const height = cell.terrain === TerrainType.Water || cell.terrain === TerrainType.DeepWater
          ? 0.1
          : cell.elevation * 3 + 0.15;
        return (
          <mesh
            key={cell.cellId}
            position={[cell.centerX, height, cell.centerY]}
            rotation={[0, Math.PI / 6, 0]}
          >
            <cylinderGeometry args={[0.7, 0.7, 0.3 + cell.elevation * 2, 6]} />
            <meshStandardMaterial color={colorHex} flatShading />
          </mesh>
        );
      })}
    </group>
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
  const { instance, tick } = useGame();
  const mainMap = instance.maps.get("main");

  const entities = useMemo(() => {
    const positionEntities = getEntitiesWithComponent(instance.state.entities, "position");
    return positionEntities.map((entityId) => {
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
        name: (identity as Record<string, unknown>)?.name as string ?? "Entity",
        isColonist,
        isAnimal,
        isStructure,
      };
    }).filter(Boolean) as Array<{
      entityId: EntityId;
      x: number;
      z: number;
      y: number;
      name: string;
      isColonist: boolean;
      isAnimal: boolean;
      isStructure: boolean;
    }>;
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
