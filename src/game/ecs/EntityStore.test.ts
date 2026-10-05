import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EventBus } from "../engine/EventBus";
import type { GameEvent, JsonValue } from "../engine/EventBus";
import { CounterName, IdCounters } from "../engine/IdCounters";
import { ComponentRegistry, defineComponent } from "./ComponentRegistry";
import { EcsError, EcsErrorKind } from "./EcsError";
import { hasComponent } from "./Entity";
import { EntityStore } from "./EntityStore";
import { PrototypeRegistry } from "./PrototypeRegistry";

const positionComponent = defineComponent(
  "Position",
  z.object({ mapId: z.number().int(), cellIndex: z.number().int() }).strict(),
  () => ({ mapId: 0, cellIndex: 0 }),
);
const inventoryComponent = defineComponent(
  "Inventory",
  z.object({ slotCount: z.number().int().min(1), coins: z.number().int().min(0) }).strict(),
  () => ({ slotCount: 4, coins: 0 }),
);
const nameComponent = defineComponent("Identity", z.object({ given: z.string() }).strict(), () => ({
  given: "",
}));

type Fixture = {
  store: EntityStore;
  counters: IdCounters;
  bus: EventBus;
  events: GameEvent[];
  components: ComponentRegistry;
  prototypes: PrototypeRegistry;
};

function createFixture(): Fixture {
  const components = new ComponentRegistry();
  components.register(positionComponent);
  components.register(inventoryComponent);
  components.register(nameComponent);
  const prototypes = new PrototypeRegistry(components);
  prototypes.register({ id: "citizen", components: { Position: {}, Inventory: {}, Identity: {} } });
  prototypes.register({ id: "rock", components: { Position: {} } });
  const counters = new IdCounters();
  const bus = new EventBus();
  const events: GameEvent[] = [];
  bus.subscribe("entity.**", (_payload, event) => {
    events.push(event);
  });
  return {
    store: new EntityStore({ components, prototypes, counters, bus }),
    counters,
    bus,
    events,
    components,
    prototypes,
  };
}

function ecsKind(action: () => void): EcsErrorKind | null {
  try {
    action();
    return null;
  } catch (failure) {
    return failure instanceof EcsError ? failure.kind : null;
  }
}

describe("EntityStore spawn and lookup", () => {
  it("assigns ascending ids starting at 1 and applies prototype defaults and overrides", () => {
    const { store } = createFixture();
    const first = store.spawn("citizen", { Inventory: { coins: 9 } });
    const second = store.spawn("rock", { Position: { cellIndex: 4 } });
    expect([first.id, second.id]).toEqual([1, 2]);
    expect(first.components["Inventory"]).toEqual({ slotCount: 4, coins: 9 });
    expect(second.components).toEqual({ Position: { mapId: 0, cellIndex: 4 } });
    expect(store.size).toBe(2);
    expect(store.get(1)).toBe(first);
    expect(store.require(2)).toBe(second);
    expect(store.has(3)).toBe(false);
    expect(store.get(3)).toBeUndefined();
    expect(ecsKind(() => store.require(3))).toBe(EcsErrorKind.UnknownEntity);
    expect(ecsKind(() => store.spawn("ghost"))).toBe(EcsErrorKind.UnknownPrototype);
  });

  it("keeps instances independent", () => {
    const { store } = createFixture();
    const left = store.spawn("citizen");
    const right = store.spawn("citizen");
    left.components["Inventory"]!["coins"] = 50;
    expect(right.components["Inventory"]).toEqual({ slotCount: 4, coins: 0 });
  });

  it("lists entities in ascending id order", () => {
    const { store } = createFixture();
    for (let count = 0; count < 5; count += 1) {
      store.spawn("rock");
    }
    expect(store.entities().map((entity) => entity.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("emits entity.spawned with the position when present", () => {
    const { store, bus, events } = createFixture();
    store.spawn("rock", { Position: { mapId: 3, cellIndex: 12 } });
    bus.processQueue();
    expect(events).toEqual([
      {
        name: "entity.spawned",
        payload: { entityId: 1, prototypeId: "rock", mapId: 3, cellIndex: 12 },
      },
    ]);
  });
});

describe("EntityStore components", () => {
  it("adds and removes components at runtime and narrows with hasComponent", () => {
    const { store, bus, events } = createFixture();
    const entity = store.spawn("rock");
    expect(hasComponent(entity, inventoryComponent)).toBe(false);
    const added = store.addComponent(entity.id, inventoryComponent, { coins: 3 });
    expect(added).toEqual({ slotCount: 4, coins: 3 });
    expect(hasComponent(entity, inventoryComponent)).toBe(true);
    expect(store.removeComponent(entity.id, inventoryComponent)).toBe(true);
    expect(store.removeComponent(entity.id, inventoryComponent)).toBe(false);
    expect(hasComponent(entity, inventoryComponent)).toBe(false);
    bus.processQueue();
    expect(events.map((event) => event.name)).toEqual([
      "entity.spawned",
      "entity.component.added",
      "entity.component.removed",
    ]);
    expect(events[1]?.payload).toEqual({ entityId: 1, component: "Inventory" });
  });

  it("rejects duplicate components, invalid data and unknown entities", () => {
    const { store } = createFixture();
    const entity = store.spawn("citizen");
    expect(ecsKind(() => store.addComponent(entity.id, inventoryComponent))).toBe(
      EcsErrorKind.ComponentExists,
    );
    const rock = store.spawn("rock");
    expect(ecsKind(() => store.addComponent(rock.id, inventoryComponent, { coins: -1 }))).toBe(
      EcsErrorKind.InvalidComponentData,
    );
    expect(hasComponent(rock, inventoryComponent)).toBe(false);
    expect(ecsKind(() => store.addComponent(99, inventoryComponent))).toBe(
      EcsErrorKind.UnknownEntity,
    );
    expect(ecsKind(() => store.removeComponent(99, inventoryComponent))).toBe(
      EcsErrorKind.UnknownEntity,
    );
  });

  it("replaceComponent validates and swaps the data", () => {
    const { store } = createFixture();
    const entity = store.spawn("citizen");
    store.replaceComponent(entity.id, inventoryComponent, { slotCount: 8, coins: 1 });
    expect(entity.components["Inventory"]).toEqual({ slotCount: 8, coins: 1 });
    expect(
      ecsKind(() =>
        store.replaceComponent(entity.id, inventoryComponent, { slotCount: 0, coins: 1 }),
      ),
    ).toBe(EcsErrorKind.InvalidComponentData);
    const rock = store.spawn("rock");
    expect(
      ecsKind(() =>
        store.replaceComponent(rock.id, inventoryComponent, { slotCount: 1, coins: 1 }),
      ),
    ).toBe(EcsErrorKind.MissingComponent);
  });

  it("version counts component adds and removes and resets on load", () => {
    const { store } = createFixture();
    const entity = store.spawn("rock");
    expect(store.version(entity.id)).toBe(0);
    store.addComponent(entity.id, inventoryComponent);
    store.removeComponent(entity.id, inventoryComponent);
    expect(store.version(entity.id)).toBe(2);
    store.restore(JSON.parse(JSON.stringify(store.serialize())) as JsonValue);
    expect(store.version(entity.id)).toBe(0);
    expect(ecsKind(() => store.version(99))).toBe(EcsErrorKind.UnknownEntity);
  });
});

describe("EntityStore deletion", () => {
  it("defers removal until flushDeletions and never reuses ids", () => {
    const { store, bus, events } = createFixture();
    store.spawn("rock");
    store.spawn("rock");
    store.spawn("rock");
    store.requestDelete(2);
    store.requestDelete(2);
    expect(store.isPendingDelete(2)).toBe(true);
    expect(store.isPendingDelete(1)).toBe(false);
    expect(store.has(2)).toBe(true);
    expect(store.entities().map((entity) => entity.id)).toEqual([1, 3]);
    expect(store.entities({ includePendingDelete: true }).map((entity) => entity.id)).toEqual([
      1, 2, 3,
    ]);
    const removed = store.flushDeletions();
    expect(removed.map((entity) => entity.id)).toEqual([2]);
    expect(store.has(2)).toBe(false);
    expect(store.flushDeletions()).toEqual([]);
    expect(store.spawn("rock").id).toBe(4);
    bus.processQueue();
    const deleted = events.filter((event) => event.name === "entity.deleted");
    expect(deleted.map((event) => event.payload)).toEqual([
      { entityId: 2, prototypeId: "rock", name: null },
    ]);
    expect(ecsKind(() => store.requestDelete(2))).toBe(EcsErrorKind.UnknownEntity);
  });

  it("runs every before-delete hook and uses the first name", () => {
    const { store, bus, events } = createFixture();
    const seen: number[] = [];
    store.addBeforeDeleteHook((entity) => {
      seen.push(entity.id);
      return entity.components["Identity"]
        ? (entity.components["Identity"]["given"] as string)
        : null;
    });
    let secondRan = 0;
    store.addBeforeDeleteHook(() => {
      secondRan += 1;
      return "second";
    });
    const citizen = store.spawn("citizen", { Identity: { given: "Ada" } });
    store.requestDelete(citizen.id);
    store.flushDeletions();
    bus.processQueue();
    expect(seen).toEqual([citizen.id]);
    expect(secondRan).toBe(1);
    expect(events.at(-1)?.payload).toEqual({ entityId: 1, prototypeId: "citizen", name: "Ada" });
  });

  it("refuses to serialize with flagged deletions", () => {
    const { store } = createFixture();
    store.spawn("rock");
    store.requestDelete(1);
    expect(ecsKind(() => store.serialize())).toBe(EcsErrorKind.InvalidState);
  });
});

describe("EntityStore serialization", () => {
  function populated(): Fixture {
    const fixture = createFixture();
    fixture.store.spawn("citizen", { Identity: { given: "Ada" } });
    fixture.store.spawn("rock", { Position: { cellIndex: 9 } });
    fixture.store.spawn("citizen");
    fixture.store.requestDelete(2);
    fixture.store.flushDeletions();
    return fixture;
  }

  it("round-trips through JSON and keeps counters so deleted ids stay unused", () => {
    const source = populated();
    const json = JSON.stringify(source.store.serialize());
    const countersJson = JSON.stringify(source.counters.serialize());
    const target = createFixture();
    target.counters.restore(JSON.parse(countersJson) as JsonValue);
    target.store.restore(JSON.parse(json) as JsonValue);
    expect(JSON.stringify(target.store.serialize())).toBe(json);
    expect(target.store.entities().map((entity) => entity.id)).toEqual([1, 3]);
    expect(target.store.spawn("rock").id).toBe(4);
    expect(target.counters.peek(CounterName.EntityId)).toBe(5);
  });

  it("serializes components sorted by name and as an independent copy", () => {
    const { store } = populated();
    const state = store.serialize();
    expect(Object.keys(state.entities[0]?.components ?? {})).toEqual([
      "Identity",
      "Inventory",
      "Position",
    ]);
    state.entities[0]!.components["Inventory"]!["coins"] = 99;
    expect(store.require(1).components["Inventory"]?.["coins"]).toBe(0);
  });

  it("restore rejects corrupt state and leaves the store untouched", () => {
    const { store, counters } = populated();
    const before = JSON.stringify(store.serialize());
    const valid = store.serialize();
    const bad: JsonValue[] = [
      { entities: [{ id: 1, prototype: "ghost", components: {} }] },
      {
        entities: [
          { id: 3, prototype: "rock", components: {} },
          { id: 1, prototype: "rock", components: {} },
        ],
      },
      {
        entities: [{ id: counters.peek(CounterName.EntityId), prototype: "rock", components: {} }],
      },
      { entities: [{ id: 1, prototype: "rock", components: { Nope: {} } }] },
      {
        entities: [
          { id: 1, prototype: "rock", components: { Position: { mapId: 0, cellIndex: 1.5 } } },
        ],
      },
      {
        entities: [
          {
            id: 1,
            prototype: "rock",
            components: { Position: { mapId: 0, cellIndex: 1, extra: 1 } },
          },
        ],
      },
      { entities: [{ id: 0, prototype: "rock", components: {} }] },
      { entities: [], extra: true },
      { entities: [{ id: 1, prototype: "rock", components: {}, extra: 1 }] },
      "text",
    ];
    for (const value of bad) {
      expect(ecsKind(() => store.restore(value))).not.toBeNull();
    }
    expect(JSON.stringify(store.serialize())).toBe(before);
    expect(valid.entities).toHaveLength(2);
  });

  it("two stores built with the same operations serialize identically", () => {
    expect(JSON.stringify(populated().store.serialize())).toBe(
      JSON.stringify(populated().store.serialize()),
    );
  });
});
