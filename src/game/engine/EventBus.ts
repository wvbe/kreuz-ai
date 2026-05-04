/**
 * Event bus with typed payloads and hierarchical string routing.
 * Supports wildcard subscriptions and type-narrowing via event type discriminator.
 */

export type GameEvent = {
  type: string;
  payload: Record<string, unknown>;
  tick: number;
};

export type EventHandler = (event: GameEvent) => void;

export type EventBusState = {
  handlers: Map<string, Set<EventHandler>>;
  queue: GameEvent[];
};

/**
 * Creates a new empty event bus.
 */
export function createEventBus(): EventBusState {
  return {
    handlers: new Map(),
    queue: [],
  };
}

/**
 * Subscribes a handler to events matching a pattern.
 * Supports exact match and wildcard prefix (e.g., "entity.*" matches "entity.created").
 */
export function subscribe(bus: EventBusState, pattern: string, handler: EventHandler): void {
  const existing = bus.handlers.get(pattern);
  if (existing) {
    existing.add(handler);
  } else {
    bus.handlers.set(pattern, new Set([handler]));
  }
}

/**
 * Unsubscribes a handler from a pattern.
 */
export function unsubscribe(bus: EventBusState, pattern: string, handler: EventHandler): void {
  const handlers = bus.handlers.get(pattern);
  if (handlers) {
    handlers.delete(handler);
    if (handlers.size === 0) {
      bus.handlers.delete(pattern);
    }
  }
}

/**
 * Emits an event immediately to all matching handlers.
 */
export function emit(bus: EventBusState, event: GameEvent): void {
  for (const [pattern, handlers] of bus.handlers) {
    if (matchesPattern(pattern, event.type)) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }
}

/**
 * Queues an event for later processing.
 */
export function enqueue(bus: EventBusState, event: GameEvent): void {
  bus.queue.push(event);
}

/**
 * Flushes all queued events, emitting them to handlers.
 */
export function flush(bus: EventBusState): void {
  const events = [...bus.queue];
  bus.queue.length = 0;
  for (const event of events) {
    emit(bus, event);
  }
}

/**
 * Checks if a pattern matches an event type.
 * Supports exact match and wildcard (*) at end of dot-separated segments.
 */
export function matchesPattern(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (pattern === eventType) return true;
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return eventType.startsWith(prefix + ".") || eventType === prefix;
  }
  return false;
}
