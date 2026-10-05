import { z } from "zod";
import type { EventBus, JsonValue } from "../engine/EventBus";
import { CounterName } from "../engine/IdCounters";
import type { IdCounters } from "../engine/IdCounters";
import type { Entity, EntityId } from "../ecs/Entity";
import { GameMap, mapStateSchema } from "./GameMap";
import { MapError, MapErrorKind } from "./MapError";
import { mapDimensionsFor } from "./mapSize";
import type { MapSize } from "./mapSize";
import { GridType } from "./mapTypes";
import type { BlockReason, MapLink, MapLocation, MapState } from "./mapTypes";
import { OccupantIndex } from "./OccupantIndex";
import type { TerrainRegistry } from "./TerrainRegistry";

/**
 * Everything a {@link MapRegistry} needs; all instances are owned by one engine.
 */
export type MapRegistryOptions = {
  terrain: TerrainRegistry;
  counters: IdCounters;
  /**
   * Receives `map.created`, `map.terrain.changed`, `map.cell.obstruction.changed` and
   * `entity.map.changed` when given.
   */
  bus?: EventBus;
};

/**
 * Options of {@link MapRegistry.createMap}.
 */
export type CreateMapOptions = {
  gridType: GridType;
  /**
   * Terrain every cell starts with.
   */
  terrainId: string;
  /**
   * Square: tiles per row. Not allowed together with `size`.
   */
  width?: number;
  /**
   * Square: tile rows. Not allowed together with `size`.
   */
  height?: number;
  /**
   * Voronoi: number of cells. Not allowed together with `size`.
   */
  cellCount?: number;
  /**
   * Starting-map size option (DECISIONS D-06) instead of explicit dimensions.
   */
  size?: MapSize;
  /**
   * Voronoi: Lloyd passes (default 2).
   */
  relaxPasses?: number;
  /**
   * Geometry and generator seed, integer 0..2^32-1; required for voronoi maps, default 0 for
   * square maps.
   */
  seed?: number;
  /**
   * Generator name stored in the params (default `blank`).
   */
  generator?: string;
  /**
   * Parent map for sub-maps.
   */
  parentId?: number;
};

/**
 * Options of {@link MapRegistry.linkMaps}.
 */
export type LinkMapsOptions = {
  mapId: number;
  cell: number;
  targetMapId: number;
  targetCell: number;
  /**
   * Also create the reverse link (default false).
   */
  bidirectional?: boolean;
};

/**
 * Result of {@link MapRegistry.queryCell} (spec 004 `queryCell`); zone membership is added by
 * the zone system.
 */
export type CellInfo = {
  mapId: number;
  cellIndex: number;
  traversable: boolean;
  terrainType: string;
  moveCost: number;
  blockReason: BlockReason | null;
  occupants: EntityId[];
  link: MapLink | null;
};

const mapListSchema = z.array(mapStateSchema);

/**
 * All maps of a game: creation with persisted ids, parent/child sub-maps, links between maps,
 * the cell-to-entity occupant index and entity travel across links (spec 004, DECISIONS D-05 and
 * D-21). Maps are always all loaded. Serialization is the root key `maps`.
 */
export class MapRegistry {
  /**
   * Derived cell occupancy; kept consistent by the placement methods of this registry.
   */
  readonly occupants = new OccupantIndex();
  private maps = new Map<number, GameMap>();

  /**
   * Creates an empty registry.
   *
   * @param options - Terrain registry, counters and optional bus of the owning engine.
   */
  constructor(private readonly options: MapRegistryOptions) {}

  /**
   * Number of maps.
   *
   * @returns The count.
   */
  get size(): number {
    return this.maps.size;
  }

  /**
   * Creates a map filled with one terrain, allocates its id and emits `map.created`.
   *
   * @param create - Grid kind, dimensions (or size), seed, parent.
   * @returns The new map.
   */
  createMap(create: CreateMapOptions): GameMap {
    if (create.parentId !== undefined) {
      this.require(create.parentId);
    }
    const explicit =
      create.width !== undefined || create.height !== undefined || create.cellCount !== undefined;
    if (create.size !== undefined && explicit) {
      throw new MapError(MapErrorKind.InvalidParams, "give either size or explicit dimensions");
    }
    const sized = create.size === undefined ? null : mapDimensionsFor(create.size, create.gridType);
    const width = sized?.width ?? create.width;
    const height = sized?.height ?? create.height;
    const cellCount = sized?.cellCount ?? create.cellCount;
    if (create.gridType === GridType.Voronoi && create.seed === undefined) {
      throw new MapError(MapErrorKind.InvalidParams, "voronoi maps need a seed");
    }
    const state: MapState = {
      id: 0,
      gridType: create.gridType,
      params: { generator: create.generator ?? "blank", seed: create.seed ?? 0 },
      parentId: create.parentId ?? null,
      cells: [],
      links: [],
    };
    if (create.gridType === GridType.Square) {
      if (width === undefined || height === undefined) {
        throw new MapError(MapErrorKind.InvalidParams, "square maps need width and height");
      }
      state.width = width;
      state.height = height;
      state.cells = Array.from({ length: width * height }, () => ({ terrain: create.terrainId }));
    } else {
      if (cellCount === undefined) {
        throw new MapError(MapErrorKind.InvalidParams, "voronoi maps need cellCount or size");
      }
      state.params.cellCount = cellCount;
      if (create.relaxPasses !== undefined) {
        state.params.relaxPasses = create.relaxPasses;
      }
      state.cells = Array.from({ length: cellCount }, () => ({ terrain: create.terrainId }));
    }
    state.id = this.options.counters.peek(CounterName.MapId);
    const map = new GameMap(state, this.mapDependencies());
    this.options.counters.allocate(CounterName.MapId);
    this.maps.set(map.id, map);
    this.options.bus?.emit("map.created", { mapId: map.id, gridType: map.gridType });
    return map;
  }

  /**
   * Looks up a map.
   *
   * @param mapId - Map id.
   * @returns The map, or undefined.
   */
  get(mapId: number): GameMap | undefined {
    return this.maps.get(mapId);
  }

  /**
   * Looks up a map and throws when it does not exist.
   *
   * @param mapId - Map id.
   * @returns The map.
   */
  require(mapId: number): GameMap {
    const found = this.maps.get(mapId);
    if (!found) {
      throw new MapError(MapErrorKind.UnknownMap, `map ${String(mapId)} does not exist`);
    }
    return found;
  }

  /**
   * Lists all maps, ascending id.
   *
   * @returns The maps.
   */
  list(): GameMap[] {
    return [...this.maps.values()].sort((left, right) => left.id - right.id);
  }

  /**
   * Lists the sub-maps of a map, ascending id.
   *
   * @param mapId - Parent map id.
   * @returns The child maps.
   */
  childrenOf(mapId: number): GameMap[] {
    this.require(mapId);
    return this.list().filter((map) => map.parentId === mapId);
  }

  /**
   * Deletes a map. Rejected while entities stand on it, it has sub-maps, or another map links
   * into it (DECISIONS D-21). Ids are never reused.
   *
   * @param mapId - Map id.
   */
  deleteMap(mapId: number): void {
    this.require(mapId);
    const reasons: string[] = [];
    if (this.occupants.countOnMap(mapId) > 0) {
      reasons.push("entities stand on it");
    }
    if (this.childrenOf(mapId).length > 0) {
      reasons.push("it has sub-maps");
    }
    const linked = this.list().some(
      (map) => map.id !== mapId && map.links().some((link) => link.targetMapId === mapId),
    );
    if (linked) {
      reasons.push("other maps link into it");
    }
    if (reasons.length > 0) {
      throw new MapError(
        MapErrorKind.MapInUse,
        `map ${mapId} cannot be deleted: ${reasons.join(", ")}`,
      );
    }
    this.maps.delete(mapId);
  }

  /**
   * Links a cell to a cell of another map (one link per cell), optionally both ways.
   *
   * @param link - Source, target and direction.
   */
  linkMaps(link: LinkMapsOptions): void {
    const source = this.require(link.mapId);
    const target = this.require(link.targetMapId);
    if (source.id === target.id) {
      throw new MapError(MapErrorKind.InvalidLink, `map ${source.id} cannot link to itself`);
    }
    if (!target.inBounds(link.targetCell) || !source.inBounds(link.cell)) {
      throw new MapError(MapErrorKind.OutOfBounds, "link cell is outside its map");
    }
    if (link.bidirectional === true && target.getLink(link.targetCell)) {
      throw new MapError(
        MapErrorKind.InvalidLink,
        `cell ${link.targetCell} of map ${target.id} already has a link`,
      );
    }
    source.addLink({ cell: link.cell, targetMapId: target.id, targetCell: link.targetCell });
    if (link.bidirectional === true) {
      target.addLink({ cell: link.targetCell, targetMapId: source.id, targetCell: link.cell });
    }
  }

  /**
   * Places an unplaced entity in a traversable cell. Co-location is allowed. The caller sets the
   * entity's `Position` component.
   *
   * @param entityId - Entity id.
   * @param mapId - Map id.
   * @param cell - Cell index.
   */
  placeEntity(entityId: EntityId, mapId: number, cell: number): void {
    this.requireTraversable(mapId, cell);
    this.occupants.add(entityId, { mapId, cellIndex: cell });
  }

  /**
   * Moves a placed entity to a traversable cell of the map it is on.
   *
   * @param entityId - Entity id.
   * @param cell - Destination cell.
   * @returns The cell it left.
   */
  moveEntity(entityId: EntityId, cell: number): number {
    const from = this.occupants.locationOf(entityId);
    if (!from) {
      throw new MapError(MapErrorKind.UnknownOccupant, `entity ${entityId} is not on any map`);
    }
    this.requireTraversable(from.mapId, cell);
    this.occupants.move(entityId, { mapId: from.mapId, cellIndex: cell });
    return from.cellIndex;
  }

  /**
   * Takes an entity off the maps.
   *
   * @param entityId - Entity id.
   * @returns The location it left.
   */
  removeEntity(entityId: EntityId): MapLocation {
    return this.occupants.remove(entityId);
  }

  /**
   * Moves an entity to any traversable cell of any map in one atomic step and emits
   * `entity.map.changed` when the map differs.
   *
   * @param entityId - Entity id.
   * @param mapId - Destination map.
   * @param cell - Destination cell.
   * @returns The new location.
   */
  transferEntity(entityId: EntityId, mapId: number, cell: number): MapLocation {
    this.requireTraversable(mapId, cell);
    const destination = { mapId, cellIndex: cell };
    const from = this.occupants.move(entityId, destination);
    if (from.mapId !== mapId) {
      this.options.bus?.emit("entity.map.changed", {
        entityId,
        fromMapId: from.mapId,
        toMapId: mapId,
        cellIndex: cell,
      });
    }
    return destination;
  }

  /**
   * Sends an entity through the link of the cell it stands on (map travel; atomic: there is no
   * intermediate state in which the entity is on neither map).
   *
   * @param entityId - Entity id.
   * @returns The new location.
   */
  travel(entityId: EntityId): MapLocation {
    const from = this.occupants.locationOf(entityId);
    if (!from) {
      throw new MapError(MapErrorKind.UnknownOccupant, `entity ${entityId} is not on any map`);
    }
    const link = this.require(from.mapId).getLink(from.cellIndex);
    if (!link) {
      throw new MapError(
        MapErrorKind.InvalidLink,
        `cell ${from.cellIndex} of map ${from.mapId} has no link`,
      );
    }
    return this.transferEntity(entityId, link.targetMapId, link.targetCell);
  }

  /**
   * Describes one cell (spec 004 `queryCell`).
   *
   * @param mapId - Map id.
   * @param cell - Cell index.
   * @returns Traversability, terrain, movement cost, block reason, occupants and link.
   */
  queryCell(mapId: number, cell: number): CellInfo {
    const map = this.require(mapId);
    const reason = map.blockReason(cell);
    return {
      mapId,
      cellIndex: cell,
      traversable: reason === null,
      terrainType: map.terrainAt(cell),
      moveCost: map.moveCost(cell),
      blockReason: reason,
      occupants: this.occupants.occupantsOf(mapId, cell),
      link: map.getLink(cell),
    };
  }

  /**
   * Rebuilds the occupant index from `Position` components (call after the entity store was
   * restored). Every position must name an existing map and an in-bounds cell.
   *
   * @param entities - Entities to scan, normally `EntityStore.entities()`.
   */
  rebuildOccupants(entities: readonly Entity[]): void {
    this.occupants.rebuild(entities);
    for (const entity of entities) {
      const location = this.occupants.locationOf(entity.id);
      if (location && !this.get(location.mapId)?.inBounds(location.cellIndex)) {
        this.occupants.clear();
        throw new MapError(
          MapErrorKind.InvalidState,
          `entity ${entity.id} stands at cell ${location.cellIndex} of map ${location.mapId}, which does not exist`,
        );
      }
    }
  }

  /**
   * Serializes all maps ascending by id (root key `maps`). Geometry is not included.
   *
   * @returns JSON-safe map states.
   */
  serialize(): MapState[] {
    return this.list().map((map) => map.serialize());
  }

  /**
   * Replaces all maps with validated saved ones, regenerating geometry from the params. Counters
   * must be restored first. On any error the current maps are kept. The occupant index is
   * cleared; call {@link MapRegistry.rebuildOccupants} afterwards.
   *
   * @param saved - Parsed JSON of {@link MapRegistry.serialize}.
   */
  restore(saved: JsonValue): void {
    const parsed = mapListSchema.safeParse(saved);
    if (!parsed.success) {
      throw new MapError(MapErrorKind.InvalidState, `invalid saved maps: ${parsed.error.message}`);
    }
    const nextId = this.options.counters.peek(CounterName.MapId);
    const restored = new Map<number, GameMap>();
    let previous = 0;
    for (const state of parsed.data) {
      if (state.id <= previous || state.id >= nextId) {
        throw new MapError(
          MapErrorKind.InvalidState,
          `saved map ids must ascend and stay below nextMapId (${nextId}); got ${state.id}`,
        );
      }
      previous = state.id;
      restored.set(state.id, new GameMap(state, this.mapDependencies()));
    }
    for (const map of restored.values()) {
      if (map.parentId !== null && (map.parentId >= map.id || !restored.has(map.parentId))) {
        throw new MapError(
          MapErrorKind.InvalidState,
          `map ${map.id} has missing or later parent ${map.parentId}`,
        );
      }
      for (const link of map.links()) {
        const target = restored.get(link.targetMapId);
        if (!target || target.id === map.id || !target.inBounds(link.targetCell)) {
          throw new MapError(
            MapErrorKind.InvalidState,
            `map ${map.id} cell ${link.cell} links to missing map ${link.targetMapId} cell ${link.targetCell}`,
          );
        }
      }
    }
    this.maps = restored;
    this.occupants.clear();
  }

  private mapDependencies(): { terrain: TerrainRegistry; bus?: EventBus } {
    return this.options.bus
      ? { terrain: this.options.terrain, bus: this.options.bus }
      : { terrain: this.options.terrain };
  }

  private requireTraversable(mapId: number, cell: number): void {
    const map = this.require(mapId);
    const reason = map.blockReason(cell);
    if (reason !== null) {
      throw new MapError(
        MapErrorKind.NotTraversable,
        `cell ${cell} of map ${mapId} is not traversable (${reason})`,
      );
    }
  }
}
