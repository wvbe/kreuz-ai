import { jsonValueSchema } from "../ecs/jsonData";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { JsonValue } from "../engine/EventBus";
import { ApiError, ApiErrorKind } from "./ApiError";
import type { CommandQueue } from "./CommandQueue";
import type { QueryResult } from "./CommandResult";
import type { EventLog } from "./EventLog";
import { formatZodIssues, toApiError } from "./toApiError";
import type {
  CellView,
  EntityDetailView,
  EntityListFilter,
  EntityListView,
  EventLogView,
  MapListView,
  MapView,
  PendingCommandsView,
  SettlementSummaryView,
  StateView,
  TimeView,
} from "./Views";
import {
  buildCellView,
  buildEntityDetailView,
  buildEntityListView,
  buildEventLogView,
  buildMapListView,
  buildMapView,
  buildPendingCommandsView,
  buildSettlementView,
  buildStateView,
  buildTimeView,
} from "./viewBuilders";

/**
 * The read-only side of a session (`session.query`): typed methods for the kernel views and
 * {@link SessionQuery.run} for any registered query by name. Every call builds a fresh view from
 * copies, so a returned view never writes through to the engine and queries never change state.
 */
export class SessionQuery {
  /**
   * Creates the query side of a session.
   *
   * @param engine - The engine to read.
   * @param queue - The session's command queue.
   * @param log - The session's recent events.
   */
  constructor(
    private readonly engine: GameEngine,
    private readonly queue: CommandQueue,
    private readonly log: EventLog,
  ) {}

  /**
   * Runs a registered query (kernel or registered by a system) and returns plain JSON.
   *
   * @param name - Query name, e.g. `entities` or `jobs.board`.
   * @param args - Arguments as a JSON object; default `{}`.
   * @returns The view, or a structured failure (unknown query, invalid arguments, not found).
   */
  run(name: string, args: JsonValue = {}): QueryResult {
    try {
      const registration = this.engine.getQuery(name);
      if (registration === undefined) {
        throw new ApiError(ApiErrorKind.UnknownQuery, `unknown query "${name}"`);
      }
      const checked = registration.schema.safeParse(args);
      if (!checked.success) {
        throw new ApiError(
          ApiErrorKind.InvalidPayload,
          `invalid arguments for query "${name}"`,
          formatZodIssues(checked.error.issues),
        );
      }
      const normalized = jsonValueSchema.parse(checked.data);
      return { ok: true, data: jsonValueSchema.parse(registration.run(normalized, this.engine)) };
    } catch (failure) {
      const error = toApiError(failure);
      return {
        ok: false,
        error: { kind: error.kind, message: error.message, issues: [...error.issues] },
      };
    }
  }

  /**
   * Names of all registered queries.
   *
   * @returns Names, sorted.
   */
  names(): string[] {
    return this.engine.queryNames();
  }

  /**
   * Session overview (query `state`).
   *
   * @returns The view.
   */
  state(): StateView {
    return buildStateView(this.engine, this.queue.size);
  }

  /**
   * The clock (query `time`).
   *
   * @returns The view.
   */
  time(): TimeView {
    return buildTimeView(this.engine);
  }

  /**
   * A page of entities (query `entities`).
   *
   * @param filter - Optional prototype filter and paging.
   * @returns The view.
   */
  entities(filter?: EntityListFilter): EntityListView {
    return buildEntityListView(this.engine, filter);
  }

  /**
   * One entity with its components (query `entity`).
   *
   * @param id - Entity id.
   * @returns The view, or null when it does not exist.
   */
  entity(id: EntityId): EntityDetailView | null {
    return buildEntityDetailView(this.engine, id);
  }

  /**
   * The maps of the game (query `maps`).
   *
   * @returns The view.
   */
  maps(): MapListView {
    return buildMapListView(this.engine);
  }

  /**
   * One map (query `map`).
   *
   * @param mapId - Map id.
   * @returns The view, or null when the map does not exist.
   */
  map(mapId: number): MapView | null {
    return this.orNull(() => buildMapView(this.engine, mapId));
  }

  /**
   * One cell (query `cell`).
   *
   * @param mapId - Map id.
   * @param cellIndex - Cell index.
   * @returns The view, or null when the map or cell does not exist.
   */
  cell(mapId: number, cellIndex: number): CellView | null {
    return this.orNull(() => buildCellView(this.engine, mapId, cellIndex));
  }

  /**
   * Placeholder settlement overview (query `settlement`).
   *
   * @returns The view.
   */
  settlement(): SettlementSummaryView {
    return buildSettlementView(this.engine);
  }

  /**
   * The tail of the event stream (query `event-log`).
   *
   * @param count - How many events at most; default all buffered.
   * @returns The view.
   */
  eventLog(count?: number): EventLogView {
    return buildEventLogView(this.log, count);
  }

  /**
   * Commands waiting for the next tick (query `pending-commands`).
   *
   * @returns The view.
   */
  pendingCommands(): PendingCommandsView {
    return buildPendingCommandsView(this.queue);
  }

  private orNull<View>(build: () => View): View | null {
    try {
      return build();
    } catch (failure) {
      const error = toApiError(failure);
      if (error.kind === ApiErrorKind.NotFound) {
        return null;
      }
      throw error;
    }
  }
}
