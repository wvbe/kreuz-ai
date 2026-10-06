import type { EventRecord, QueryResult } from "../../../game/api/CommandResult";
import type { GameSession } from "../../../game/api/GameSession";
import type { JsonValue } from "../../../game/engine/EventBus";
import { StoreBase } from "./StoreBase";

/**
 * How many events the store keeps for `useEvents`.
 */
export const gameStoreEventLimit = 200;

/**
 * The external store between the session and React (spec 024 FR-009). Its state is a version
 * number that grows whenever the game may have changed (a tick, a command, a new or loaded game);
 * components subscribe to it with `useSyncExternalStore` and read queries through
 * {@link GameStore.query}, which runs each distinct query once per version and hands every
 * reader the same result object. The store holds no game data of its own.
 *
 * The host decides when to {@link GameStore.invalidate}: once per scheduled tick and once per
 * dispatched command or step, never per event, so a burst of events is one render.
 */
export class GameStore extends StoreBase<number> {
  private cache = new Map<string, QueryResult>();
  private events: EventRecord[] = [];
  private gameEpoch = 0;

  /**
   * Creates the store over a session.
   *
   * @param session - The session whose queries are served.
   */
  constructor(private readonly session: GameSession) {
    super(0);
  }

  /**
   * Marks the game as possibly changed: drops the cached query results and notifies readers.
   */
  invalidate(): void {
    this.cache = new Map();
    this.replace(this.getSnapshot() + 1);
  }

  /**
   * Counts the games started or loaded in this store; data that only changes with a new game
   * (map geometry) is cached per epoch instead of per version.
   *
   * @returns The epoch.
   */
  epoch(): number {
    return this.gameEpoch;
  }

  /**
   * Starts a new epoch (a new or loaded game replaced the world).
   */
  startEpoch(): void {
    this.gameEpoch += 1;
  }

  /**
   * Runs a query, or returns the result already computed for this version.
   *
   * @param name - Query name.
   * @param args - Query arguments as JSON.
   * @returns The query result.
   */
  query(name: string, args: JsonValue = {}): QueryResult {
    const key = `${name}\u0000${JSON.stringify(args)}`;
    const known = this.cache.get(key);
    if (known !== undefined) {
      return known;
    }
    const result = this.session.query.run(name, args);
    this.cache.set(key, result);
    return result;
  }

  /**
   * Remembers an event for `useEvents` (the oldest are dropped beyond the limit).
   *
   * @param record - The delivered event.
   */
  pushEvent(record: EventRecord): void {
    this.events = [...this.events, record].slice(-gameStoreEventLimit);
  }

  /**
   * The remembered events, oldest first.
   *
   * @returns The events; a new array after every `pushEvent`.
   */
  recentEvents(): readonly EventRecord[] {
    return this.events;
  }
}
