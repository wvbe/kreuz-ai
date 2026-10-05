/**
 * Per-game typed publish/subscribe bus (spec 010, amended by docs/DECISIONS.md). Emits are
 * queued and delivered FIFO by {@link EventBus.processQueue} at the tick-boundary pipeline slot.
 * There is no promise based `waitFor`; serialized task records subscribe through step machines.
 */

/**
 * Any JSON value. Event payloads must be JSON with integer-only numbers.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * A delivered event: dot-separated kebab-case name plus a JSON payload.
 */
export type GameEvent<T extends JsonValue = JsonValue> = {
  name: string;
  payload: T;
};

/**
 * An event waiting in the queue, with the nesting depth at which it was emitted.
 */
export type QueuedEvent = {
  name: string;
  payload: JsonValue;
  depth: number;
};

/**
 * Serialized form of the bus; subscriptions are never serialized.
 */
export type EventBusState = {
  queue: QueuedEvent[];
};

/**
 * Opaque numeric handle returned by {@link EventBus.subscribe}.
 */
export type SubscriptionHandle = number;

/**
 * Subscriber callback; receives the payload and the full event.
 */
export type EventHandler<T extends JsonValue = JsonValue> = (
  payload: T,
  event: GameEvent<T>,
) => void;

/**
 * Options for {@link EventBus.subscribe}.
 */
export type SubscribeOptions = {
  /**
   * Unsubscribe automatically after the first delivery (any match, for wildcards).
   */
  once?: boolean;
};

/**
 * Kinds of failure reported to the injected error sink.
 */
export enum EventBusErrorKind {
  SubscriberThrew = "subscriber-threw",
  DepthExceeded = "depth-exceeded",
}

/**
 * A failure the bus caught and isolated instead of throwing.
 */
export type EventBusErrorReport = {
  kind: EventBusErrorKind;
  topic: string;
  message: string;
};

/**
 * Receives isolated failures; the engine wires this to its logger.
 */
export type EventBusErrorSink = (report: EventBusErrorReport) => void;

/**
 * Thrown synchronously for programmer errors such as invalid names or non-JSON payloads.
 */
export class EventBusError extends Error {
  /**
   * Creates an event bus error.
   *
   * @param message - Description of the rejected input.
   */
  constructor(message: string) {
    super(message);
    this.name = "EventBusError";
  }
}

/**
 * Maximum nesting depth; an event emitted from a depth-16 handler is rejected.
 */
export const maxEventDepth = 16;

const segmentPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Tells whether `name` is a valid concrete event name (lowercase kebab-case dot segments).
 *
 * @param name - Candidate event name.
 * @returns True when valid.
 */
export function isValidEventName(name: string): boolean {
  return name.split(".").every((segment) => segmentPattern.test(segment));
}

/**
 * Tells whether `pattern` is a valid subscription pattern: a valid name, or a name whose
 * last segment alone is `*` (one segment) or `**` (one or more segments).
 *
 * @param pattern - Candidate subscription pattern.
 * @returns True when valid.
 */
export function isValidEventPattern(pattern: string): boolean {
  const segments = pattern.split(".");
  const last = segments[segments.length - 1];
  const head = last === "*" || last === "**" ? segments.slice(0, -1) : segments;
  return head.every((segment) => segmentPattern.test(segment));
}

/**
 * Tells whether a concrete event name matches a subscription pattern. `a.*` matches `a.b` but
 * not `a` or `a.b.c`; `a.**` matches `a.b` and `a.b.c` but not `a`.
 *
 * @param pattern - Valid subscription pattern.
 * @param name - Valid concrete event name.
 * @returns True when the pattern selects the name.
 */
export function eventNameMatches(pattern: string, name: string): boolean {
  if (pattern === "**") {
    return true;
  }
  if (pattern === "*") {
    return !name.includes(".");
  }
  if (pattern.endsWith(".**")) {
    return name.startsWith(pattern.slice(0, -2));
  }
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1);
    return name.startsWith(prefix) && !name.slice(prefix.length).includes(".");
  }
  return pattern === name;
}

/**
 * Type guard that narrows an event to one topic and payload type.
 *
 * @param event - The event to test.
 * @param pattern - Pattern the event name must match.
 * @param check - Predicate validating the payload shape.
 * @returns True when the event matches the pattern and the payload passes `check`.
 */
export function isEventOf<T extends JsonValue>(
  event: GameEvent,
  pattern: string,
  check: (payload: JsonValue) => payload is T,
): event is GameEvent<T> {
  return eventNameMatches(pattern, event.name) && check(event.payload);
}

/**
 * Deep-copies a payload while verifying it is JSON with safe-integer numbers only.
 *
 * @param value - Payload to copy.
 * @returns An independent copy.
 */
export function cloneEventPayload(value: JsonValue): JsonValue {
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new EventBusError(`payload numbers must be safe integers, got ${String(value)}`);
      }
      return value;
    case "object": {
      if (value === null) {
        return null;
      }
      if (Array.isArray(value)) {
        return value.map((item) => cloneEventPayload(item));
      }
      const copy: { [key: string]: JsonValue } = {};
      for (const key of Object.keys(value)) {
        copy[key] = cloneEventPayload(value[key] as JsonValue);
      }
      return copy;
    }
    default:
      throw new EventBusError(`payload contains a non-JSON ${typeof value} value`);
  }
}

type Subscription = {
  handle: SubscriptionHandle;
  pattern: string;
  handler: EventHandler;
  once: boolean;
  active: boolean;
};

/**
 * Deterministic event queue and dispatcher. One instance exists per game engine.
 */
export class EventBus {
  private queue: QueuedEvent[] = [];
  private readonly subscriptions: Subscription[] = [];
  private nextHandle = 1;
  private processing = false;
  private currentDepth = -1;

  /**
   * Creates an empty bus.
   *
   * @param errorSink - Receives subscriber exceptions and depth overflows; defaults to ignoring.
   */
  constructor(private readonly errorSink: EventBusErrorSink = () => undefined) {}

  /**
   * Queues an event for delivery at the next {@link EventBus.processQueue}. Emits made while
   * processing are appended to the same drain at depth + 1; beyond {@link maxEventDepth} the emit
   * is dropped and reported to the error sink.
   *
   * @param name - Concrete event name, e.g. `inventory.item.stored`.
   * @param payload - JSON payload with integer-only numbers; copied on emit.
   */
  emit<T extends JsonValue>(name: string, payload: T): void {
    if (!isValidEventName(name)) {
      throw new EventBusError(`invalid event name "${name}"`);
    }
    const depth = this.currentDepth + 1;
    if (depth > maxEventDepth) {
      this.errorSink({
        kind: EventBusErrorKind.DepthExceeded,
        topic: name,
        message: `event "${name}" dropped: nesting depth exceeds ${maxEventDepth}`,
      });
      return;
    }
    this.queue.push({ name, payload: cloneEventPayload(payload), depth });
  }

  /**
   * Registers a subscriber. Delivery order is global registration order across exact and
   * wildcard subscriptions. The set of receivers of an event is resolved when it is processed.
   *
   * @param pattern - Event name or wildcard pattern.
   * @param handler - Callback invoked with the payload.
   * @param options - Pass `{ once: true }` for a one-time subscription.
   * @returns Handle for {@link EventBus.unsubscribe}.
   */
  subscribe<T extends JsonValue = JsonValue>(
    pattern: string,
    handler: EventHandler<T>,
    options: SubscribeOptions = {},
  ): SubscriptionHandle {
    if (!isValidEventPattern(pattern)) {
      throw new EventBusError(`invalid event pattern "${pattern}"`);
    }
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.subscriptions.push({
      handle,
      pattern,
      handler: handler as EventHandler,
      once: options.once === true,
      active: true,
    });
    return handle;
  }

  /**
   * Removes a subscription; takes effect for every later delivery, even mid-drain.
   *
   * @param handle - Handle returned by {@link EventBus.subscribe}.
   * @returns True if the subscription existed.
   */
  unsubscribe(handle: SubscriptionHandle): boolean {
    const index = this.subscriptions.findIndex((entry) => entry.handle === handle);
    const found = this.subscriptions[index];
    if (!found) {
      return false;
    }
    found.active = false;
    this.subscriptions.splice(index, 1);
    return true;
  }

  /**
   * Drains the queue FIFO, including events emitted by handlers, until it is empty. Subscriber
   * exceptions are isolated and reported to the error sink. Calling it re-entrantly is a no-op.
   */
  processQueue(): void {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      let head = 0;
      while (head < this.queue.length) {
        const event = this.queue[head] as QueuedEvent;
        head += 1;
        this.currentDepth = event.depth;
        const receivers = this.subscriptions.filter((entry) =>
          eventNameMatches(entry.pattern, event.name),
        );
        for (const receiver of receivers) {
          if (!receiver.active) {
            continue;
          }
          if (receiver.once) {
            this.unsubscribe(receiver.handle);
          }
          try {
            receiver.handler(event.payload, { name: event.name, payload: event.payload });
          } catch (failure) {
            this.errorSink({
              kind: EventBusErrorKind.SubscriberThrew,
              topic: event.name,
              message: failure instanceof Error ? failure.message : String(failure),
            });
          }
        }
        if (head > 1024) {
          this.queue = this.queue.slice(head);
          head = 0;
        }
      }
      this.queue = [];
    } finally {
      this.processing = false;
      this.currentDepth = -1;
    }
  }

  /**
   * Returns a deep-copied snapshot of the pending events in delivery order.
   *
   * @returns Pending events as `{ name, payload }`.
   */
  getQueue(): GameEvent[] {
    return this.queue.map((entry) => ({
      name: entry.name,
      payload: cloneEventPayload(entry.payload),
    }));
  }

  /**
   * Serializes the pending queue (subscriptions are not serialized).
   *
   * @returns JSON-safe bus state.
   */
  serialize(): EventBusState {
    return {
      queue: this.queue.map((entry) => ({
        name: entry.name,
        payload: cloneEventPayload(entry.payload),
        depth: entry.depth,
      })),
    };
  }

  /**
   * Replaces the pending queue with serialized events, preserving order. Subscribers registered
   * afterwards still receive these events because receivers are resolved at processing time.
   *
   * @param state - State produced by {@link EventBus.serialize}.
   */
  restore(state: EventBusState): void {
    if (this.processing) {
      throw new EventBusError("cannot restore while the queue is being processed");
    }
    const restored = state.queue.map((entry) => {
      if (!isValidEventName(entry.name)) {
        throw new EventBusError(`invalid event name "${entry.name}" in saved queue`);
      }
      if (!Number.isInteger(entry.depth) || entry.depth < 0 || entry.depth > maxEventDepth) {
        throw new EventBusError(`invalid depth ${String(entry.depth)} in saved queue`);
      }
      return { name: entry.name, payload: cloneEventPayload(entry.payload), depth: entry.depth };
    });
    this.queue = restored;
  }
}
