import { describe, it, expect, vi } from "vitest";
import {
  createEventBus,
  subscribe,
  unsubscribe,
  emit,
  enqueue,
  flush,
  matchesPattern,
} from "./EventBus";

describe("EventBus", () => {
  it("emits events to subscribed handlers", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    subscribe(bus, "entity.created", handler);
    emit(bus, { type: "entity.created", payload: { id: 1 }, tick: 0 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "entity.created", payload: { id: 1 }, tick: 0 });
  });

  it("does not emit to unsubscribed handlers", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    subscribe(bus, "entity.created", handler);
    unsubscribe(bus, "entity.created", handler);
    emit(bus, { type: "entity.created", payload: {}, tick: 0 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports wildcard pattern matching", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    subscribe(bus, "entity.*", handler);
    emit(bus, { type: "entity.created", payload: {}, tick: 0 });
    emit(bus, { type: "entity.destroyed", payload: {}, tick: 0 });
    emit(bus, { type: "job.completed", payload: {}, tick: 0 });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("supports global wildcard", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    subscribe(bus, "*", handler);
    emit(bus, { type: "anything", payload: {}, tick: 0 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("queues and flushes events", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    subscribe(bus, "test", handler);
    enqueue(bus, { type: "test", payload: { value: 1 }, tick: 0 });
    enqueue(bus, { type: "test", payload: { value: 2 }, tick: 0 });
    expect(handler).not.toHaveBeenCalled();
    flush(bus);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("matchesPattern handles exact match", () => {
    expect(matchesPattern("entity.created", "entity.created")).toBe(true);
    expect(matchesPattern("entity.created", "entity.destroyed")).toBe(false);
  });

  it("matchesPattern handles wildcard suffix", () => {
    expect(matchesPattern("entity.*", "entity.created")).toBe(true);
    expect(matchesPattern("entity.*", "entity.destroyed")).toBe(true);
    expect(matchesPattern("entity.*", "job.created")).toBe(false);
  });
});
