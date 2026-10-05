import { cloneJson } from "../ecs/jsonData";
import type { JsonValue } from "../engine/EventBus";
import type { CallEvents, EventRecord } from "./CommandResult";

/**
 * Default size of the recent-event buffer of a session.
 */
export const defaultRecentEventLimit = 256;

/**
 * Bounded buffer of the most recent delivered events with a gap-free sequence number. It is a
 * session convenience (event tail for renderers, events attached to results), not game state, so
 * it is neither saved nor part of the state hash.
 */
export class EventLog {
  private records: EventRecord[] = [];
  private lastSeq = 0;

  /**
   * Creates the buffer.
   *
   * @param limit - How many records are kept; older ones are dropped.
   */
  constructor(private readonly limit: number = defaultRecentEventLimit) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`recent event limit must be a positive integer, got ${String(limit)}`);
    }
  }

  /**
   * Appends an event (the payload is copied).
   *
   * @param tick - Tick count at delivery.
   * @param name - Event topic.
   * @param payload - Event payload.
   * @returns The stored record's copy.
   */
  push(tick: number, name: string, payload: JsonValue): EventRecord {
    this.lastSeq += 1;
    const record: EventRecord = { seq: this.lastSeq, tick, name, payload: cloneJson(payload) };
    this.records.push(record);
    if (this.records.length > this.limit) {
      this.records.splice(0, this.records.length - this.limit);
    }
    return { ...record, payload: cloneJson(payload) };
  }

  /**
   * Sequence number of the newest event; pass it to {@link EventLog.since} later.
   *
   * @returns The sequence number (0 before the first event).
   */
  mark(): number {
    return this.lastSeq;
  }

  /**
   * Events after a mark, as they were seen by one call.
   *
   * @param mark - Value of {@link EventLog.mark} taken before the call.
   * @returns The still buffered events after the mark and how many were dropped.
   */
  since(mark: number): CallEvents {
    const events = this.records
      .filter((record) => record.seq > mark)
      .map((record) => ({ ...record, payload: cloneJson(record.payload) }));
    return { events, droppedEvents: this.lastSeq - mark - events.length };
  }

  /**
   * The newest events, oldest first.
   *
   * @param count - How many to return at most; default all buffered.
   * @returns Copies of the records.
   */
  recent(count: number = this.limit): EventRecord[] {
    return this.records
      .slice(Math.max(0, this.records.length - Math.max(0, count)))
      .map((record) => ({ ...record, payload: cloneJson(record.payload) }));
  }

  /**
   * Number of events delivered in the session so far (including dropped ones).
   *
   * @returns The total.
   */
  get total(): number {
    return this.lastSeq;
  }
}
