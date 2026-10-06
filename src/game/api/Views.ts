import type { JsonValue } from "../engine/EventBus";
import type { SpeedSetting } from "../time/GameTime";
import type { EventRecord } from "./CommandResult";

// The view model (DECISIONS section 5): every view is plain, readonly JSON built from copies. It
// shares no object with the engine, so holding or mutating a view never affects the game, and
// `JSON.parse(JSON.stringify(view))` equals the view.

/**
 * The clock.
 */
export type TimeView = {
  readonly tick: number;
  readonly paused: boolean;
  readonly speed: SpeedSetting;
  readonly tickIntervalMs: number;
  readonly day: number;
  readonly tickOfDay: number;
  readonly hourOfDay: number;
};

/**
 * Overview of the session: the clock, the options of the game and a few counts.
 */
export type StateView = {
  readonly hasGame: boolean;
  readonly time: TimeView;
  readonly seed: number;
  readonly difficulty: string;
  readonly startingTier: string | null;
  readonly entityCount: number;
  readonly mapCount: number;
  /**
   * Commands accepted but waiting for the next tick.
   */
  readonly pendingCommandCount: number;
};

/**
 * Filter and paging of the entity list.
 */
export type EntityListFilter = {
  /**
   * Only entities of this prototype.
   */
  readonly prototype?: string;
  /**
   * Page size, 1..10000; default 500.
   */
  readonly limit?: number;
  /**
   * Entities to skip; default 0.
   */
  readonly offset?: number;
};

/**
 * One row of the entity list.
 */
export type EntitySummaryView = {
  readonly id: number;
  readonly prototype: string;
};

/**
 * A page of entities, ascending by id.
 */
export type EntityListView = {
  /**
   * Entities matching the filter, before paging.
   */
  readonly total: number;
  readonly offset: number;
  readonly entities: readonly EntitySummaryView[];
};

/**
 * One entity with all its components.
 */
export type EntityDetailView = {
  readonly id: number;
  readonly prototype: string;
  readonly components: { readonly [componentName: string]: JsonValue };
};

/**
 * One row of the map list.
 */
export type MapSummaryView = {
  readonly id: number;
  readonly gridType: string;
  readonly parentId: number | null;
  readonly cellCount: number;
};

/**
 * The maps of the game.
 */
export type MapListView = {
  readonly maps: readonly MapSummaryView[];
};

/**
 * A link from a cell of one map to a cell of another.
 */
export type MapLinkView = {
  readonly cell: number;
  readonly targetMapId: number;
  readonly targetCell: number;
};

/**
 * A point in map units (DECISIONS D-40): milli-tiles on square maps, `0..65535` on voronoi maps.
 */
export type PointView = {
  readonly x: number;
  readonly y: number;
};

/**
 * One map: grid, terrain per cell and the representative point of every cell, which is all a
 * renderer needs to draw it (D-40).
 */
export type MapView = {
  readonly id: number;
  readonly gridType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly parentId: number | null;
  readonly params: { readonly [name: string]: JsonValue };
  readonly cellCount: number;
  /**
   * Terrain id of every cell, by cell index.
   */
  readonly terrain: readonly string[];
  /**
   * Representative point of every cell, by cell index: the tile centre on square maps, the site
   * on voronoi maps.
   */
  readonly centers: readonly PointView[];
  /**
   * Width and height of the whole map in map units.
   */
  readonly extent: PointView;
  readonly links: readonly MapLinkView[];
};

/**
 * The polygon of every cell of one map (query `map-geometry`): derived, never saved, a pure
 * function of the map params (AD9). Counter-clockwise corners in map units, clipped to the
 * extent; square maps give four corners per tile.
 */
export type MapGeometryView = {
  readonly mapId: number;
  /**
   * Corners of every cell, by cell index.
   */
  readonly polygons: readonly (readonly PointView[])[];
};

/**
 * One entity standing on a map (query `map-entities`).
 */
export type MapEntityView = {
  readonly id: number;
  readonly prototype: string;
  readonly cell: number;
  /**
   * Names of the components the entity has (a renderer classifies by them; values are read with
   * the `entity` query).
   */
  readonly components: readonly string[];
};

/**
 * Every entity with a position on one map, ascending by id (query `map-entities`).
 */
export type MapEntitiesView = {
  readonly mapId: number;
  readonly entities: readonly MapEntityView[];
};

/**
 * One cell of one map.
 */
export type CellView = {
  readonly mapId: number;
  readonly cellIndex: number;
  readonly terrain: string;
  readonly traversable: boolean;
  readonly moveCost: number;
  readonly blockReason: string | null;
  /**
   * Ids of the entities standing on the cell.
   */
  readonly occupants: readonly number[];
  /**
   * Indices of the adjacent cells (what a wall ring has to cover to enclose a zone).
   */
  readonly neighbors: readonly number[];
  readonly link: MapLinkView | null;
};

/**
 * Placeholder settlement overview until settlement progress (spec 027) exists; later phases
 * extend it by registering their own queries.
 */
export type SettlementSummaryView = {
  readonly tier: string | null;
  readonly difficulty: string;
  /**
   * Entities of a humanoid prototype.
   */
  readonly population: number;
  readonly entityCount: number;
  readonly mapCount: number;
  readonly day: number;
  readonly tick: number;
};

/**
 * The tail of the session's event stream.
 */
export type EventLogView = {
  /**
   * Events delivered in the session so far, including those no longer buffered.
   */
  readonly total: number;
  readonly events: readonly EventRecord[];
};

/**
 * One command waiting for the next tick.
 */
export type PendingCommandView = {
  readonly commandId: number;
  readonly kind: string;
  readonly payload: JsonValue;
  /**
   * Tick count at dispatch.
   */
  readonly tick: number;
};

/**
 * Commands accepted but not yet applied, in application order.
 */
export type PendingCommandsView = {
  readonly commands: readonly PendingCommandView[];
};

/**
 * Names of the kernel queries and the types of their views; `SessionQuery` offers each as a
 * typed method and `GameSession.query.run(name, args)` serves them (and the queries of later
 * phases) as JSON.
 */
export type Views = {
  readonly state: StateView;
  readonly time: TimeView;
  readonly entities: EntityListView;
  readonly entity: EntityDetailView | null;
  readonly maps: MapListView;
  readonly map: MapView;
  readonly "map-geometry": MapGeometryView;
  readonly "map-entities": MapEntitiesView;
  readonly cell: CellView;
  readonly settlement: SettlementSummaryView;
  readonly "event-log": EventLogView;
  readonly "pending-commands": PendingCommandsView;
};
