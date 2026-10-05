import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { BlockReason } from "../map/mapTypes";
import type { GameMap } from "../map/GameMap";
import { furnitureComponent } from "../storage/furnitureComponent";
import { checkRequirement, compileRequirements, formatRequirement } from "./furnitureRequirements";
import type { FurniturePiece } from "./furnitureRequirements";
import { outerRing } from "./zoneGeometry";
import { enclosurePrototypeIds, jobBoardPrototypeId, ZoneGapKind, ZoneStatus } from "./zoneTypes";
import type { ZoneData, ZoneGap } from "./zoneTypes";

/**
 * The derived state of one zone: what `evaluateZone` computes from the tiles, the walls and the
 * furniture.
 */
export type ZoneEvaluation = {
  isRoom: boolean;
  status: ZoneStatus;
  gaps: ZoneGap[];
  /**
   * Furniture entities on the zone's tiles, ascending.
   */
  furniture: EntityId[];
  /**
   * Job board entities on the zone's tiles, ascending.
   */
  boards: EntityId[];
};

/**
 * Tells whether a cell touches the border of its map (any corner of its polygon lies on the map
 * extent). The map border counts as not enclosed (DECISIONS D-11), on both grid kinds.
 *
 * @param map - The map.
 * @param cell - Cell index.
 * @returns True for cells at the edge of the map.
 */
export function isBorderCell(map: GameMap, cell: number): boolean {
  const extent = map.geometry.extent;
  return (map.geometry.polygons[cell] ?? []).some(
    (corner) => corner.x <= 0 || corner.y <= 0 || corner.x >= extent.x || corner.y >= extent.y,
  );
}

/**
 * Tells whether a cell holds something that closes a room: a wall or door entity (open or closed
 * doors both count) or a map obstruction of kind wall (DECISIONS D-11).
 *
 * @param engine - The engine.
 * @param map - The map of the cell.
 * @param cell - Cell index.
 * @returns True when the cell is a wall or a door.
 */
export function isEnclosingCell(engine: GameEngine, map: GameMap, cell: number): boolean {
  if (map.blockReason(cell) === BlockReason.Wall) {
    return true;
  }
  return engine.maps.occupants.occupantsOf(map.id, cell).some((id) => {
    const entity = engine.store.get(id);
    return (
      entity !== undefined &&
      !engine.store.isPendingDelete(id) &&
      enclosurePrototypeIds.includes(entity.prototype)
    );
  });
}

/**
 * The cells around a set of cells (outside it) that hold a wall or a door, ascending.
 *
 * @param engine - The engine.
 * @param map - The map.
 * @param tiles - The cells, for example a zone's tiles.
 * @returns The enclosing cells of the outer ring.
 */
export function enclosingRingCells(
  engine: GameEngine,
  map: GameMap,
  tiles: readonly number[],
): number[] {
  return outerRing(map, tiles).filter((cell) => isEnclosingCell(engine, map, cell));
}

/**
 * Tells whether a set of cells is a room: no tile is on the map border and every cell around it
 * (outside the set) is a wall or a door. Cells of other zones that are not walls do not enclose.
 *
 * @param engine - The engine.
 * @param map - The map.
 * @param tiles - The cells.
 * @returns True when fully enclosed; false for an empty set.
 */
export function isEnclosed(engine: GameEngine, map: GameMap, tiles: readonly number[]): boolean {
  if (tiles.length === 0 || tiles.some((tile) => isBorderCell(map, tile))) {
    return false;
  }
  return outerRing(map, tiles).every((cell) => isEnclosingCell(engine, map, cell));
}

/**
 * Evaluates a zone from the current state of the world (spec 015 FR-005, FR-007, FR-017,
 * DECISIONS D-11): room detection, minimum size, furniture requirements and the job board
 * requirement, with a gap for everything unmet. Furniture counts when its entity stands on a tile
 * of the zone (build sites are no furniture). Status: `Active` without gaps, `Inactive` when the
 * zone is too small or not enclosed as its type needs, otherwise `Incomplete`. Pure: it reads
 * the engine and changes nothing.
 *
 * @param engine - The engine.
 * @param data - The zone's component data.
 * @returns Room flag, status, gaps and the furniture and boards found.
 */
export function evaluateZone(engine: GameEngine, data: ZoneData): ZoneEvaluation {
  const type = engine.content.zones.require(data.zoneTypeId);
  const map = engine.maps.require(data.mapId);
  const pieces: FurniturePiece[] = [];
  const furniture: EntityId[] = [];
  const boards: EntityId[] = [];
  for (const tile of data.tiles) {
    for (const id of engine.maps.occupants.occupantsOf(data.mapId, tile)) {
      const entity = engine.store.get(id);
      if (entity === undefined || engine.store.isPendingDelete(id)) {
        continue;
      }
      const piece = getComponent(entity, furnitureComponent);
      if (piece !== undefined) {
        furniture.push(id);
        pieces.push({
          furnitureId: piece.furnitureId,
          tags: engine.content.furniture.find(piece.furnitureId)?.tags ?? [],
        });
      }
      if (entity.prototype === jobBoardPrototypeId) {
        boards.push(id);
      }
    }
  }
  furniture.sort((left, right) => left - right);
  boards.sort((left, right) => left - right);
  const isRoom = isEnclosed(engine, map, data.tiles);
  const gaps: ZoneGap[] = [];
  if (data.tiles.length < type.minTiles) {
    gaps.push({
      kind: ZoneGapKind.TooSmall,
      requirement: null,
      required: type.minTiles,
      present: data.tiles.length,
    });
  }
  if (type.requiresRoom && !isRoom) {
    gaps.push({ kind: ZoneGapKind.NotEnclosed, requirement: null, required: null, present: null });
  }
  const structural = gaps.length > 0;
  for (const requirement of compileRequirements(type)) {
    const check = checkRequirement(requirement, data.tiles.length, pieces);
    if (!check.met) {
      gaps.push({
        kind: ZoneGapKind.MissingFurniture,
        requirement: formatRequirement(requirement),
        required: check.required,
        present: check.present,
      });
    }
  }
  if (type.requiresJobBoard && boards.length === 0) {
    gaps.push({
      kind: ZoneGapKind.MissingJobBoard,
      requirement: null,
      required: 1,
      present: 0,
    });
  }
  const status =
    gaps.length === 0
      ? ZoneStatus.Active
      : structural
        ? ZoneStatus.Inactive
        : ZoneStatus.Incomplete;
  return { isRoom, status, gaps, furniture, boards };
}
