import { describe, expect, it } from "vitest";
import {
  EventBus,
  EventBusError,
  EventBusErrorKind,
  cloneEventPayload,
  eventNameMatches,
  isEventOf,
  isValidEventName,
  isValidEventPattern,
  maxEventDepth,
} from "./EventBus";
import type { EventBusErrorReport, GameEvent, JsonValue } from "./EventBus";

function collect(bus: EventBus, pattern: string): string[] {
  const seen: string[] = [];
  bus.subscribe(pattern, (_payload, event) => {
    seen.push(event.name);
  });
  return seen;
}

describe("isValidEventName / isValidEventPattern", () => {
  // @covers 010:FR-002
  it("accepts lowercase kebab-case dot names", () => {
    expect(isValidEventName("inventory.item.stored")).toBe(true);
    expect(isValidEventName("error.system-failed")).toBe(true);
    expect(isValidEventName("tick.begin")).toBe(true);
  });

  // @covers 010:FR-002
  it("rejects empty, uppercase, underscore and wildcard names", () => {
    for (const bad of ["", "Inventory.item", "a_b.c", "a..b", ".a", "a.", "a.*", "a b"]) {
      expect(isValidEventName(bad)).toBe(false);
    }
  });

  // @covers 010:FR-005
  it("allows wildcards only as the last segment", () => {
    for (const good of ["a.*", "a.b.**", "*", "**", "a.b"]) {
      expect(isValidEventPattern(good)).toBe(true);
    }
    for (const bad of ["a.*.b", "**.a", "a.b*", "", "A.*", "a.***"]) {
      expect(isValidEventPattern(bad)).toBe(false);
    }
  });
});

describe("eventNameMatches", () => {
  // @covers 010:FR-001
  // @covers 010:FR-003
  // @covers 010:FR-004
  // @covers 010:FR-005
  // @covers 010:FR-019
  // @covers 010:SC-005
  it("handles exact, single-segment and multi-segment wildcards", () => {
    expect(eventNameMatches("inventory.item.*", "inventory.item.stored")).toBe(true);
    expect(eventNameMatches("inventory.item.*", "inventory.item.stack.merged")).toBe(false);
    expect(eventNameMatches("inventory.item.*", "inventory.item")).toBe(false);
    expect(eventNameMatches("inventory.**", "inventory.item.stack.merged")).toBe(true);
    expect(eventNameMatches("inventory.**", "inventory")).toBe(false);
    expect(eventNameMatches("inventory.**", "inventoryx.a")).toBe(false);
    expect(eventNameMatches("entity.*", "entity.movement.started")).toBe(false);
    expect(eventNameMatches("a.b", "a.b")).toBe(true);
    expect(eventNameMatches("a.b", "a.c")).toBe(false);
    expect(eventNameMatches("**", "x.y.z")).toBe(true);
    expect(eventNameMatches("*", "x")).toBe(true);
    expect(eventNameMatches("*", "x.y")).toBe(false);
  });
});

describe("isEventOf", () => {
  it("narrows by pattern and payload predicate", () => {
    const isStored = (payload: JsonValue): payload is { quantity: number } =>
      typeof payload === "object" && payload !== null && "quantity" in payload;
    const event: GameEvent = { name: "inventory.item.stored", payload: { quantity: 3 } };
    expect(isEventOf(event, "inventory.item.*", isStored)).toBe(true);
    expect(isEventOf(event, "game.*", isStored)).toBe(false);
    expect(isEventOf({ name: "inventory.item.stored", payload: 1 }, "inventory.**", isStored)).toBe(
      false,
    );
  });
});

describe("cloneEventPayload", () => {
  it("deep copies JSON and rejects non-integers and non-JSON", () => {
    const original = { list: [1, { deep: "x" }], flag: true, none: null };
    const copy = cloneEventPayload(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(() => cloneEventPayload(1.5)).toThrow(EventBusError);
    expect(() => cloneEventPayload(Number.NaN)).toThrow(EventBusError);
    expect(() => cloneEventPayload({ callback: (() => 1) as never })).toThrow(EventBusError);
    expect(() => cloneEventPayload({ missing: undefined as never })).toThrow(EventBusError);
  });
});

describe("EventBus emit / subscribe / processQueue", () => {
  // @covers 010:FR-009
  // @covers 010:FR-014
  it("delivers queued events FIFO only at processQueue with the payload", () => {
    const bus = new EventBus();
    const received: JsonValue[] = [];
    bus.subscribe("entity.spawned", (payload) => {
      received.push(payload);
    });
    bus.emit("entity.spawned", { entityId: 1, prototype: "settler" });
    bus.emit("entity.spawned", { entityId: 2, prototype: "settler" });
    expect(received).toEqual([]);
    expect(bus.getQueue()).toHaveLength(2);
    bus.processQueue();
    expect(received).toEqual([
      { entityId: 1, prototype: "settler" },
      { entityId: 2, prototype: "settler" },
    ]);
    expect(bus.getQueue()).toEqual([]);
  });

  it("rejects invalid names on emit and invalid patterns on subscribe", () => {
    const bus = new EventBus();
    expect(() => bus.emit("Bad", 1)).toThrow(EventBusError);
    expect(() => bus.emit("", 1)).toThrow(EventBusError);
    expect(() => bus.subscribe("a.*.b", () => undefined)).toThrow(EventBusError);
  });

  // @covers 010:FR-010
  // @covers 010:SC-007
  it("calls subscribers in registration order across exact and wildcard patterns", () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.subscribe("a.b", () => order.push("exact"));
    bus.subscribe("a.*", () => order.push("star"));
    bus.subscribe("a.**", () => order.push("globstar"));
    bus.subscribe("a.b", () => order.push("exact2"));
    bus.emit("a.b", null);
    bus.processQueue();
    expect(order).toEqual(["exact", "star", "globstar", "exact2"]);
  });

  // @covers 010:FR-006
  // @covers 010:FR-007
  it("once subscriptions fire a single time, including on wildcards", () => {
    const bus = new EventBus();
    let hits = 0;
    bus.subscribe("a.*", () => (hits += 1), { once: true });
    bus.emit("a.x", 1);
    bus.emit("a.y", 2);
    bus.processQueue();
    expect(hits).toBe(1);
  });

  // @covers 010:FR-008
  it("unsubscribe stops delivery, including mid-drain, and reports unknown handles", () => {
    const bus = new EventBus();
    let second = 0;
    const handle = bus.subscribe("a.b", () => (second += 1));
    bus.subscribe("a.b", () => {
      bus.unsubscribe(handle);
    });
    bus.emit("a.b", 1);
    bus.emit("a.b", 1);
    bus.processQueue();
    expect(second).toBe(1);
    expect(bus.unsubscribe(handle)).toBe(false);
    expect(bus.unsubscribe(9999)).toBe(false);
  });

  // @covers 010:FR-011
  it("a subscriber added during processing sees later events but not the current one", () => {
    const bus = new EventBus();
    const lateSeen: string[] = [];
    bus.subscribe("a.first", () => {
      bus.subscribe("a.*", (_payload, event) => {
        lateSeen.push(event.name);
      });
    });
    bus.emit("a.first", 1);
    bus.emit("a.second", 1);
    bus.processQueue();
    expect(lateSeen).toEqual(["a.second"]);
  });

  // @covers 010:FR-011
  it("receivers are resolved at processing time (late subscriber gets queued events)", () => {
    const bus = new EventBus();
    bus.emit("a.b", 7);
    const seen = collect(bus, "a.b");
    bus.processQueue();
    expect(seen).toEqual(["a.b"]);
  });

  // @covers 010:FR-009a
  it("delivers nested emits after the current event, in the same drain, FIFO", () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.subscribe("a.one", () => {
      order.push("one");
      bus.emit("a.nested", 1);
    });
    bus.subscribe("a.one", () => order.push("one-second-subscriber"));
    bus.subscribe("a.two", () => order.push("two"));
    bus.subscribe("a.nested", () => order.push("nested"));
    bus.emit("a.one", 1);
    bus.emit("a.two", 1);
    bus.processQueue();
    expect(order).toEqual(["one", "one-second-subscriber", "two", "nested"]);
    expect(bus.getQueue()).toEqual([]);
  });

  // @covers 010:FR-017
  // @covers 010:SC-006
  it("isolates a throwing subscriber and reports it to the sink", () => {
    const reports: EventBusErrorReport[] = [];
    const bus = new EventBus((report) => reports.push(report));
    let after = 0;
    bus.subscribe("a.b", () => {
      throw new Error("boom");
    });
    bus.subscribe("a.b", () => (after += 1));
    bus.emit("a.b", 1);
    bus.processQueue();
    expect(after).toBe(1);
    expect(reports).toEqual([
      { kind: EventBusErrorKind.SubscriberThrew, topic: "a.b", message: "boom" },
    ]);
  });

  it("reports non-Error throws too", () => {
    const reports: EventBusErrorReport[] = [];
    const bus = new EventBus((report) => reports.push(report));
    bus.subscribe("a.b", () => {
      throw "text";
    });
    bus.emit("a.b", 1);
    bus.processQueue();
    expect(reports[0]?.message).toBe("text");
  });

  // @covers 010:FR-009a
  it("caps nesting depth, drops the overflowing emit, and still empties the queue", () => {
    const reports: EventBusErrorReport[] = [];
    const bus = new EventBus((report) => reports.push(report));
    let delivered = 0;
    bus.subscribe("loop.again", () => {
      delivered += 1;
      bus.emit("loop.again", delivered);
    });
    bus.emit("loop.again", 0);
    bus.processQueue();
    expect(delivered).toBe(maxEventDepth + 1);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.kind).toBe(EventBusErrorKind.DepthExceeded);
    expect(bus.getQueue()).toEqual([]);
  });

  it("processQueue is a no-op when called re-entrantly", () => {
    const bus = new EventBus();
    const order: string[] = [];
    bus.subscribe("a.one", () => {
      bus.emit("a.two", 1);
      bus.processQueue();
      order.push("after-inner-process");
    });
    bus.subscribe("a.two", () => order.push("two"));
    bus.emit("a.one", 1);
    bus.processQueue();
    expect(order).toEqual(["after-inner-process", "two"]);
  });

  it("handles long queues across the compaction threshold", () => {
    const bus = new EventBus();
    let sum = 0;
    bus.subscribe("a.b", (payload) => {
      sum += payload as number;
    });
    for (let index = 0; index < 3000; index += 1) {
      bus.emit("a.b", 1);
    }
    bus.processQueue();
    expect(sum).toBe(3000);
  });

  it("copies payloads on emit so later mutation does not leak in", () => {
    const bus = new EventBus();
    const payload = { value: 1 };
    bus.emit("a.b", payload);
    payload.value = 2;
    expect(bus.getQueue()[0]?.payload).toEqual({ value: 1 });
  });
});

describe("EventBus serialize / restore", () => {
  // @covers 010:FR-015
  // @covers 010:FR-016
  // @covers 010:SC-007
  it("round-trips the queue through JSON and keeps order", () => {
    const bus = new EventBus();
    bus.emit("a.one", { count: 1 });
    bus.emit("a.two", [1, 2]);
    bus.emit("a.three", "x");
    const json = JSON.stringify(bus.serialize());
    const restored = new EventBus();
    restored.restore(JSON.parse(json) as ReturnType<EventBus["serialize"]>);
    const seen = collect(restored, "a.*");
    restored.emit("a.four", 4);
    restored.processQueue();
    expect(seen).toEqual(["a.one", "a.two", "a.three", "a.four"]);
  });

  it("restores nested depth so the cap survives a save", () => {
    const reports: EventBusErrorReport[] = [];
    const bus = new EventBus((report) => reports.push(report));
    bus.restore({ queue: [{ name: "a.b", payload: 1, depth: maxEventDepth }] });
    bus.subscribe("a.b", () => bus.emit("a.b", 1));
    bus.processQueue();
    expect(reports).toHaveLength(1);
  });

  it("rejects corrupt saved queues and restore during processing", () => {
    const bus = new EventBus();
    expect(() => bus.restore({ queue: [{ name: "Bad", payload: 1, depth: 0 }] })).toThrow(
      EventBusError,
    );
    expect(() => bus.restore({ queue: [{ name: "a.b", payload: 1, depth: -1 }] })).toThrow(
      EventBusError,
    );
    expect(() => bus.restore({ queue: [{ name: "a.b", payload: 1, depth: 99 }] })).toThrow(
      EventBusError,
    );
    let thrown: Error | undefined;
    bus.subscribe("a.b", () => {
      try {
        bus.restore({ queue: [] });
      } catch (failure) {
        thrown = failure as Error;
      }
    });
    bus.emit("a.b", 1);
    bus.processQueue();
    expect(thrown).toBeInstanceOf(EventBusError);
  });

  // @covers 010:SC-003
  // @covers 010:SC-004
  it("serializes 150 events and restores them", () => {
    const started = Number(process.hrtime.bigint()) / 1e6;
    const bus = new EventBus();
    for (let index = 0; index < 150; index += 1) {
      bus.emit("a.b", { index });
    }
    const state = JSON.parse(JSON.stringify(bus.serialize())) as ReturnType<EventBus["serialize"]>;
    new EventBus().restore(state);
    expect(state.queue).toHaveLength(150);
    for (const entry of state.queue) {
      expect(Object.keys(entry).sort()).toEqual(["depth", "name", "payload"]);
    }
    expect(Number(process.hrtime.bigint()) / 1e6 - started).toBeLessThan(1000);
  });
});
