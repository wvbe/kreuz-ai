import type { EntityId } from "../ecs/Entity";
import { cloneJson } from "../ecs/jsonData";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import type { MapLink } from "../map/mapTypes";
import { ApiError, ApiErrorKind } from "./ApiError";
import type { CommandQueue } from "./CommandQueue";
import type { EventLog } from "./EventLog";
import type {
  CellView,
  EntityDetailView,
  EntityListFilter,
  EntityListView,
  EventLogView,
  MapLinkView,
  MapListView,
  MapView,
  PendingCommandsView,
  SettlementSummaryView,
  StateView,
  TimeView,
} from "./Views";

/**
 * Default page size of the entity list.
 */
export const defaultEntityListLimit = 500;

/**
 * Largest page size of the entity list.
 */
export const maxEntityListLimit = 10_000;

function linkView(link: MapLink | null): MapLinkView | null {
  return link === null
    ? null
    : { cell: link.cell, targetMapId: link.targetMapId, targetCell: link.targetCell };
}

/**
 * The clock as a view.
 *
 * @param engine - The engine to read.
 * @returns A fresh view.
 */
export function buildTimeView(engine: GameEngine): TimeView {
  return engine.getTime();
}

/**
 * The session overview.
 *
 * @param engine - The engine to read.
 * @param pendingCommandCount - Size of the command queue.
 * @returns A fresh view.
 */
export function buildStateView(engine: GameEngine, pendingCommandCount: number): StateView {
  const state = engine.getState();
  return {
    hasGame: state.hasGame,
    time: state.time,
    seed: state.initOptions.seed,
    difficulty: state.initOptions.difficulty,
    startingTier: state.initOptions.startingTier,
    entityCount: state.entityCount,
    mapCount: state.mapCount,
    pendingCommandCount,
  };
}

/**
 * A page of entities (id and prototype only), ascending by id; entities flagged for deletion are
 * hidden.
 *
 * @param engine - The engine to read.
 * @param filter - Optional prototype filter and paging.
 * @returns A fresh view.
 */
export function buildEntityListView(
  engine: GameEngine,
  filter: EntityListFilter = {},
): EntityListView {
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? defaultEntityListLimit;
  const matching = engine.store
    .entities()
    .filter(
      (entity) =>
        !engine.store.isPendingDelete(entity.id) &&
        (filter.prototype === undefined || entity.prototype === filter.prototype),
    );
  return {
    total: matching.length,
    offset,
    entities: matching
      .slice(offset, offset + limit)
      .map((entity) => ({ id: entity.id, prototype: entity.prototype })),
  };
}

/**
 * One entity with its components.
 *
 * @param engine - The engine to read.
 * @param id - Entity id.
 * @returns A fresh view, or null when the entity does not exist.
 */
export function buildEntityDetailView(engine: GameEngine, id: EntityId): EntityDetailView | null {
  const entity = engine.getEntity(id);
  return entity === undefined
    ? null
    : { id: entity.id, prototype: entity.prototype, components: cloneJson(entity.components) };
}

/**
 * The maps of the game, ascending by id.
 *
 * @param engine - The engine to read.
 * @returns A fresh view.
 */
export function buildMapListView(engine: GameEngine): MapListView {
  return {
    maps: engine.maps.list().map((map) => {
      const state = map.serialize();
      return {
        id: state.id,
        gridType: state.gridType,
        parentId: state.parentId,
        cellCount: state.cells.length,
      };
    }),
  };
}

/**
 * One map.
 *
 * @param engine - The engine to read.
 * @param mapId - Map id.
 * @returns A fresh view.
 * @throws {ApiError} NotFound when the map does not exist.
 */
export function buildMapView(engine: GameEngine, mapId: number): MapView {
  const state = engine.getMap(mapId);
  if (state === undefined) {
    throw new ApiError(ApiErrorKind.NotFound, `map ${mapId} does not exist`);
  }
  const params: { [name: string]: JsonValue } = {
    generator: state.params.generator,
    seed: state.params.seed,
  };
  if (state.params.cellCount !== undefined) {
    params["cellCount"] = state.params.cellCount;
  }
  if (state.params.relaxPasses !== undefined) {
    params["relaxPasses"] = state.params.relaxPasses;
  }
  return {
    id: state.id,
    gridType: state.gridType,
    width: state.width ?? null,
    height: state.height ?? null,
    parentId: state.parentId,
    params,
    cellCount: state.cells.length,
    terrain: state.cells.map((cell) => cell.terrain),
    links: state.links.map((link) => ({
      cell: link.cell,
      targetMapId: link.targetMapId,
      targetCell: link.targetCell,
    })),
  };
}

/**
 * One cell of one map.
 *
 * @param engine - The engine to read.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns A fresh view.
 * @throws {ApiError} NotFound when the map or the cell does not exist.
 */
export function buildCellView(engine: GameEngine, mapId: number, cellIndex: number): CellView {
  const map = engine.maps.get(mapId);
  if (map === undefined) {
    throw new ApiError(ApiErrorKind.NotFound, `map ${mapId} does not exist`);
  }
  if (!map.inBounds(cellIndex)) {
    throw new ApiError(ApiErrorKind.NotFound, `cell ${cellIndex} is outside map ${mapId}`);
  }
  const info = engine.maps.queryCell(mapId, cellIndex);
  return {
    mapId,
    cellIndex,
    terrain: info.terrainType,
    traversable: info.traversable,
    moveCost: info.moveCost,
    blockReason: info.blockReason,
    occupants: [...info.occupants],
    link: linkView(info.link),
  };
}

/**
 * The placeholder settlement overview.
 *
 * @param engine - The engine to read.
 * @returns A fresh view.
 */
export function buildSettlementView(engine: GameEngine): SettlementSummaryView {
  const state = engine.getState();
  const population = engine.store
    .entities()
    .filter(
      (entity) =>
        engine.content.humanoids.has(entity.prototype) && !engine.store.isPendingDelete(entity.id),
    ).length;
  return {
    tier: state.initOptions.startingTier,
    difficulty: state.initOptions.difficulty,
    population,
    entityCount: state.entityCount,
    mapCount: state.mapCount,
    day: state.time.day,
    tick: state.time.tick,
  };
}

/**
 * The tail of the event stream.
 *
 * @param log - The session's event buffer.
 * @param count - How many events at most; default all buffered.
 * @returns A fresh view.
 */
export function buildEventLogView(log: EventLog, count?: number): EventLogView {
  return { total: log.total, events: log.recent(count) };
}

/**
 * The commands waiting for the next tick.
 *
 * @param queue - The session's command queue.
 * @returns A fresh view.
 */
export function buildPendingCommandsView(queue: CommandQueue): PendingCommandsView {
  return {
    commands: queue.list().map((entry) => ({
      commandId: entry.commandId,
      kind: entry.kind,
      payload: entry.payload,
      tick: entry.tick,
    })),
  };
}
