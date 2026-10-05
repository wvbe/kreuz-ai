import { z } from "zod";
import type { EventBus } from "../engine/EventBus";
import { MapError, MapErrorKind } from "./MapError";
import { buildSquareGeometry } from "./buildSquareGeometry";
import type { TerrainRegistry } from "./TerrainRegistry";
import { GridType, defaultRelaxPasses } from "./mapTypes";
import type { BlockReason, CellPoint, MapGeometry, MapLink, MapState } from "./mapTypes";
import { buildVoronoiGeometry, maxRelaxPasses, maxVoronoiCellCount } from "./voronoiGeometry";

/**
 * Largest width or height of a square map, in tiles.
 */
export const maxSquareSide = 1024;

/**
 * Strict Zod schema of one serialized map (DECISIONS D-05 plus `parentId` and `links`).
 */
export const mapStateSchema = z
  .object({
    id: z.number().int().min(1),
    gridType: z.enum(GridType),
    width: z.number().int().min(1).max(maxSquareSide).optional(),
    height: z.number().int().min(1).max(maxSquareSide).optional(),
    params: z
      .object({
        generator: z.string().min(1),
        seed: z.number().int().min(0).max(4294967295),
        cellCount: z.number().int().min(1).max(maxVoronoiCellCount).optional(),
        relaxPasses: z.number().int().min(0).max(maxRelaxPasses).optional(),
      })
      .strict(),
    parentId: z.number().int().min(1).nullable(),
    cells: z.array(z.object({ terrain: z.string().min(1) }).strict()),
    links: z.array(
      z
        .object({
          cell: z.number().int().min(0),
          targetMapId: z.number().int().min(1),
          targetCell: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * What a {@link GameMap} needs besides its saved state.
 */
export type GameMapDependencies = {
  terrain: TerrainRegistry;
  /**
   * Receives `map.terrain.changed` and `map.cell.obstruction.changed` when given.
   */
  bus?: EventBus;
};

/**
 * One map: grid kind, per-cell terrain, derived geometry, obstructions and outgoing links.
 * Geometry is derived from `(gridType, width/height or params)` on construction and is never
 * serialized (DECISIONS AD9, D-05); only terrain, params and links are state. Obstructions
 * (walls, doors, blocking furniture) are derived from entities and owned by the systems that
 * place those entities (task 3.5); they are not serialized here.
 */
export class GameMap {
  /**
   * Map id (from the persisted `nextMapId` counter).
   */
  readonly id: number;
  /**
   * Grid kind, immutable.
   */
  readonly gridType: GridType;
  /**
   * Tiles per row on square maps, otherwise null.
   */
  readonly width: number | null;
  /**
   * Tile rows on square maps, otherwise null.
   */
  readonly height: number | null;
  /**
   * Generation params with defaults applied.
   */
  readonly params: MapState["params"];
  /**
   * Parent map id for sub-maps, else null.
   */
  readonly parentId: number | null;
  /**
   * Derived cell geometry.
   */
  readonly geometry: MapGeometry;
  private readonly terrainIds: string[];
  private readonly obstructions = new Map<number, BlockReason>();
  private readonly outgoing = new Map<number, MapLink>();
  private revisionCounter = 0;

  /**
   * Builds a map from saved or freshly created state, validating everything.
   *
   * @param state - Map state; geometry is regenerated from its params.
   * @param deps - Terrain registry and optional event bus.
   */
  constructor(
    state: MapState,
    private readonly deps: GameMapDependencies,
  ) {
    const parsed = mapStateSchema.safeParse(state);
    if (!parsed.success) {
      throw new MapError(
        MapErrorKind.InvalidState,
        `map ${String(state.id)} is invalid: ${parsed.error.message}`,
      );
    }
    const data = parsed.data;
    this.id = data.id;
    this.gridType = data.gridType;
    this.parentId = data.parentId;
    if (data.gridType === GridType.Square) {
      if (
        data.width === undefined ||
        data.height === undefined ||
        data.params.cellCount !== undefined ||
        data.params.relaxPasses !== undefined
      ) {
        throw new MapError(
          MapErrorKind.InvalidState,
          `square map ${data.id} needs width and height and no cellCount or relaxPasses`,
        );
      }
      this.width = data.width;
      this.height = data.height;
      this.params = { ...data.params };
      this.geometry = buildSquareGeometry(data.width, data.height);
    } else {
      if (
        data.width !== undefined ||
        data.height !== undefined ||
        data.params.cellCount === undefined
      ) {
        throw new MapError(
          MapErrorKind.InvalidState,
          `voronoi map ${data.id} needs params.cellCount and no width or height`,
        );
      }
      this.width = null;
      this.height = null;
      this.params = {
        ...data.params,
        relaxPasses: data.params.relaxPasses ?? defaultRelaxPasses,
      };
      this.geometry = buildVoronoiGeometry({
        seed: data.params.seed,
        cellCount: data.params.cellCount,
        relaxPasses: this.params.relaxPasses ?? defaultRelaxPasses,
      });
    }
    if (data.cells.length !== this.geometry.cellCount) {
      throw new MapError(
        MapErrorKind.InvalidState,
        `map ${data.id} has ${data.cells.length} cells but its geometry has ${this.geometry.cellCount}`,
      );
    }
    this.terrainIds = data.cells.map((cell, index) => {
      if (!deps.terrain.has(cell.terrain)) {
        throw new MapError(
          MapErrorKind.UnknownTerrain,
          `map ${data.id} cell ${index} has unknown terrain "${cell.terrain}"`,
        );
      }
      return cell.terrain;
    });
    let previous = -1;
    for (const link of data.links) {
      if (link.cell <= previous || link.cell >= this.geometry.cellCount) {
        throw new MapError(
          MapErrorKind.InvalidState,
          `map ${data.id} links must be unique, ascending and in bounds (cell ${link.cell})`,
        );
      }
      previous = link.cell;
      this.outgoing.set(link.cell, { ...link });
    }
  }

  /**
   * Change counter for derived caches (path cache, task 2.2): increases synchronously on every
   * change that can alter routing (terrain, obstruction, link, fill). It is not saved, so a
   * restored map starts again at 0; caches compare the map object as well.
   *
   * @returns The revision.
   */
  get revision(): number {
    return this.revisionCounter;
  }

  /**
   * Number of cells.
   *
   * @returns The cell count.
   */
  get cellCount(): number {
    return this.geometry.cellCount;
  }

  /**
   * Tells whether a cell index exists on this map.
   *
   * @param cell - Cell index.
   * @returns True when `0 <= cell < cellCount` and it is an integer.
   */
  inBounds(cell: number): boolean {
    return Number.isInteger(cell) && cell >= 0 && cell < this.geometry.cellCount;
  }

  private requireCell(cell: number): void {
    if (!this.inBounds(cell)) {
      throw new MapError(
        MapErrorKind.OutOfBounds,
        `cell ${String(cell)} is outside map ${this.id} (${this.geometry.cellCount} cells)`,
      );
    }
  }

  /**
   * Adjacent cells, ascending cell index, identical contract on both grid kinds (4-connected on
   * square maps, Delaunay neighbours on voronoi maps).
   *
   * @param cell - Cell index.
   * @returns Read-only neighbour list.
   */
  neighbors(cell: number): readonly number[] {
    this.requireCell(cell);
    return this.geometry.adjacency[cell] as readonly number[];
  }

  /**
   * Representative point of a cell (tile centre in milli-tiles, or voronoi site).
   *
   * @param cell - Cell index.
   * @returns The point in map units.
   */
  centroid(cell: number): CellPoint {
    this.requireCell(cell);
    return this.geometry.centroids[cell] as CellPoint;
  }

  /**
   * Converts square coordinates to a cell index (`y * width + x`).
   *
   * @param column - Tile column.
   * @param row - Tile row.
   * @returns The cell index.
   */
  squareCell(column: number, row: number): number {
    if (this.width === null || this.height === null) {
      throw new MapError(MapErrorKind.InvalidParams, `map ${this.id} is not square`);
    }
    if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0) {
      throw new MapError(
        MapErrorKind.OutOfBounds,
        `tile (${column}, ${row}) is outside map ${this.id}`,
      );
    }
    if (column >= this.width || row >= this.height) {
      throw new MapError(
        MapErrorKind.OutOfBounds,
        `tile (${column}, ${row}) is outside map ${this.id}`,
      );
    }
    return row * this.width + column;
  }

  /**
   * Converts a cell index of a square map to its tile coordinates.
   *
   * @param cell - Cell index.
   * @returns Column `x` and row `y`.
   */
  squareCoordinates(cell: number): CellPoint {
    if (this.width === null) {
      throw new MapError(MapErrorKind.InvalidParams, `map ${this.id} is not square`);
    }
    this.requireCell(cell);
    return { x: cell % this.width, y: Math.floor(cell / this.width) };
  }

  /**
   * Terrain id of a cell.
   *
   * @param cell - Cell index.
   * @returns The terrain id.
   */
  terrainAt(cell: number): string {
    this.requireCell(cell);
    return this.terrainIds[cell] as string;
  }

  /**
   * Changes the terrain of one cell and emits `map.terrain.changed` when it actually changed.
   *
   * @param cell - Cell index.
   * @param terrainId - Registered terrain id.
   * @returns True when the terrain changed.
   */
  setTerrain(cell: number, terrainId: string): boolean {
    this.requireCell(cell);
    this.deps.terrain.require(terrainId);
    const from = this.terrainIds[cell] as string;
    if (from === terrainId) {
      return false;
    }
    this.terrainIds[cell] = terrainId;
    this.revisionCounter += 1;
    this.deps.bus?.emit("map.terrain.changed", {
      mapId: this.id,
      cellIndex: cell,
      from,
      // eslint-disable-next-line id-length -- event payload field name fixed by DECISIONS section 4.2
      to: terrainId,
    });
    return true;
  }

  /**
   * Sets every cell to one terrain without emitting events. Meant for map construction by a
   * generator before the map is announced (`map.created`); later edits use {@link GameMap.setTerrain}.
   *
   * @param terrainId - Registered terrain id.
   */
  fill(terrainId: string): void {
    this.deps.terrain.require(terrainId);
    this.terrainIds.fill(terrainId);
    this.revisionCounter += 1;
  }

  /**
   * Replaces the terrain of every cell at once without emitting events, for generators that
   * compute a whole map before it is used (task 2.1). Bumps `revision` once. Later edits use
   * {@link GameMap.setTerrain}.
   *
   * @param terrainIds - One registered terrain id per cell, in cell order.
   */
  assignTerrain(terrainIds: readonly string[]): void {
    if (terrainIds.length !== this.terrainIds.length) {
      throw new MapError(
        MapErrorKind.InvalidParams,
        `map ${this.id} has ${this.terrainIds.length} cells but ${terrainIds.length} terrain ids were given`,
      );
    }
    for (const terrainId of terrainIds) {
      this.deps.terrain.require(terrainId);
    }
    for (let cell = 0; cell < terrainIds.length; cell += 1) {
      this.terrainIds[cell] = terrainIds[cell] as string;
    }
    this.revisionCounter += 1;
  }

  /**
   * Movement cost of entering a cell (terrain class of DECISIONS D-04).
   *
   * @param cell - Cell index.
   * @returns Cost units per cell entry.
   */
  moveCost(cell: number): number {
    return this.deps.terrain.require(this.terrainAt(cell)).moveCost;
  }

  /**
   * Why a cell cannot be entered: impassable terrain first, else an obstruction.
   *
   * @param cell - Cell index.
   * @returns The reason, or null when the cell is traversable.
   */
  blockReason(cell: number): BlockReason | null {
    const terrain = this.deps.terrain.require(this.terrainAt(cell));
    if (!terrain.passable) {
      return terrain.blockReason;
    }
    return this.obstructions.get(cell) ?? null;
  }

  /**
   * Tells whether entities may enter a cell (terrain passable and no obstruction).
   *
   * @param cell - Cell index.
   * @returns True when traversable.
   */
  isTraversable(cell: number): boolean {
    return this.blockReason(cell) === null;
  }

  /**
   * Sets or clears the entity-made obstruction of a cell and emits
   * `map.cell.obstruction.changed` when the obstruction changed.
   *
   * @param cell - Cell index.
   * @param reason - Obstruction reason, or null to clear it.
   * @returns True when the obstruction changed.
   */
  setObstruction(cell: number, reason: BlockReason | null): boolean {
    this.requireCell(cell);
    if ((this.obstructions.get(cell) ?? null) === reason) {
      return false;
    }
    if (reason === null) {
      this.obstructions.delete(cell);
    } else {
      this.obstructions.set(cell, reason);
    }
    this.revisionCounter += 1;
    this.deps.bus?.emit("map.cell.obstruction.changed", {
      mapId: this.id,
      cellIndex: cell,
      traversable: this.isTraversable(cell),
    });
    return true;
  }

  /**
   * Gets the link leaving a cell.
   *
   * @param cell - Cell index.
   * @returns The link, or null.
   */
  getLink(cell: number): MapLink | null {
    this.requireCell(cell);
    const link = this.outgoing.get(cell);
    return link ? { ...link } : null;
  }

  /**
   * Adds a link leaving a cell; the registry validates the target.
   *
   * @param link - Link to add; the source cell must not have one yet.
   */
  addLink(link: MapLink): void {
    this.requireCell(link.cell);
    if (this.outgoing.has(link.cell)) {
      throw new MapError(
        MapErrorKind.InvalidLink,
        `cell ${link.cell} of map ${this.id} already has a link`,
      );
    }
    this.outgoing.set(link.cell, { ...link });
    this.revisionCounter += 1;
  }

  /**
   * Lists all links leaving this map, ascending source cell.
   *
   * @returns Copies of the links.
   */
  links(): MapLink[] {
    return [...this.outgoing.values()]
      .sort((left, right) => left.cell - right.cell)
      .map((link) => ({ ...link }));
  }

  /**
   * Serializes the map: params, terrain per cell and links; never the geometry. Optional fields
   * are omitted rather than set to undefined so stable stringify is exact.
   *
   * @returns JSON-safe state.
   */
  serialize(): MapState {
    const state: MapState = {
      id: this.id,
      gridType: this.gridType,
      params: { ...this.params },
      parentId: this.parentId,
      cells: this.terrainIds.map((terrain) => ({ terrain })),
      links: this.links(),
    };
    if (this.width !== null && this.height !== null) {
      state.width = this.width;
      state.height = this.height;
    }
    return state;
  }
}
