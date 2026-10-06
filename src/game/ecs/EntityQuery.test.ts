import { describe, expect, it } from "vitest";
import { z } from "zod";
import { IdCounters } from "../engine/IdCounters";
import { ComponentRegistry, defineComponent } from "./ComponentRegistry";
import { EcsError, EcsErrorKind } from "./EcsError";
import type { Entity } from "./Entity";
import {
  EntityQuery,
  getEntitiesByComponent,
  getEntitiesByProperties,
  getEntitiesByProperty,
  matchesProperty,
  parsePropertyPath,
} from "./EntityQuery";
import { EntityStore } from "./EntityStore";
import { PrototypeRegistry } from "./PrototypeRegistry";

const citizenComponent = defineComponent(
  "Citizen",
  z
    .object({
      status: z.string(),
      currentJobTypeId: z.string().nullable(),
      factions: z.array(z.number().int()),
      mood: z.number().int(),
      stats: z.object({ vigor: z.number().int() }).strict(),
    })
    .strict(),
  () => ({ status: "active", currentJobTypeId: null, factions: [], mood: 0, stats: { vigor: 10 } }),
);
const factionComponent = defineComponent("Faction", z.object({}).strict(), () => ({}));

function createStore(counters: IdCounters = new IdCounters()): EntityStore {
  const components = new ComponentRegistry();
  components.register(citizenComponent);
  components.register(factionComponent);
  const prototypes = new PrototypeRegistry(components);
  prototypes.register({ id: "citizen", components: { Citizen: {} } });
  prototypes.register({ id: "faction", components: { Faction: {} } });
  return new EntityStore({ components, prototypes, counters });
}

function seed(store: EntityStore, count: number): void {
  store.spawn("faction");
  for (let index = 0; index < count; index += 1) {
    store.spawn("citizen", {
      Citizen: {
        status: index % 3 === 0 ? "idle" : "active",
        currentJobTypeId: index % 5 === 0 ? "farm.sow" : null,
        factions: index % 2 === 0 ? [1] : [1, 99],
        mood: (index % 11) * 10 - 50,
        stats: { vigor: index },
      },
    });
  }
}

function ids(entities: Entity[]): number[] {
  return entities.map((entity) => entity.id);
}

describe("parsePropertyPath", () => {
  it("splits component and field path", () => {
    expect(parsePropertyPath("Citizen.stats.vigor")).toEqual({
      component: "Citizen",
      fields: ["stats", "vigor"],
    });
  });

  it("rejects paths without a field or with empty segments", () => {
    for (const bad of ["Citizen", "", "Citizen.", ".status", "Citizen..vigor"]) {
      expect(() => parsePropertyPath(bad)).toThrow(EcsError);
    }
    try {
      parsePropertyPath("Citizen");
    } catch (failure) {
      expect((failure as EcsError).kind).toBe(EcsErrorKind.InvalidPath);
    }
  });
});

describe("matchesProperty", () => {
  const store = createStore();
  seed(store, 3);
  const citizen = store.require(3);

  it("handles equality, ranges, contains and nested paths", () => {
    expect(matchesProperty(citizen, "Citizen.status", "active")).toBe(true);
    expect(matchesProperty(citizen, "Citizen.status", "idle")).toBe(false);
    expect(matchesProperty(citizen, "Citizen.currentJobTypeId", null)).toBe(true);
    expect(matchesProperty(citizen, "Citizen.mood", { min: -50, max: 0 })).toBe(true);
    expect(matchesProperty(citizen, "Citizen.mood", { min: 1 })).toBe(false);
    expect(matchesProperty(citizen, "Citizen.mood", { max: -40 })).toBe(true);
    expect(matchesProperty(citizen, "Citizen.mood", { max: -41 })).toBe(false);
    expect(matchesProperty(citizen, "Citizen.stats.vigor", 1)).toBe(true);
    expect(matchesProperty(citizen, "Citizen.factions", { contains: 99 })).toBe(true);
    expect(matchesProperty(citizen, "Citizen.factions", { contains: 2 })).toBe(false);
    expect(matchesProperty(citizen, "Citizen.factions", [1, 99])).toBe(true);
  });

  it("never matches missing components or fields, or ranges on non-numbers", () => {
    expect(matchesProperty(citizen, "Faction.anything", 1)).toBe(false);
    expect(matchesProperty(citizen, "Citizen.missing", 1)).toBe(false);
    expect(matchesProperty(citizen, "Citizen.status", { min: 0 })).toBe(false);
    expect(matchesProperty(citizen, "Citizen.status", { contains: "a" })).toBe(false);
  });
});

describe("getEntitiesByComponent", () => {
  it("returns matches in ascending id order, empty for unknown components", () => {
    const store = createStore();
    seed(store, 30);
    expect(getEntitiesByComponent(store, citizenComponent)).toHaveLength(30);
    expect(ids(getEntitiesByComponent(store, "Citizen"))).toEqual(
      Array.from({ length: 30 }, (_value, index) => index + 2),
    );
    expect(getEntitiesByComponent(store, factionComponent)).toHaveLength(1);
    expect(getEntitiesByComponent(store, "Unknown")).toEqual([]);
    expect(getEntitiesByComponent(createStore(), "Citizen")).toEqual([]);
  });

  it("sees entities added later and skips entities pending deletion", () => {
    const store = createStore();
    seed(store, 2);
    store.spawn("citizen");
    expect(getEntitiesByComponent(store, "Citizen")).toHaveLength(3);
    store.requestDelete(2);
    expect(ids(getEntitiesByComponent(store, "Citizen"))).toEqual([3, 4]);
  });

  it("returns a new array so mutating it does not affect the store", () => {
    const store = createStore();
    seed(store, 3);
    getEntitiesByComponent(store, "Citizen").length = 0;
    expect(getEntitiesByComponent(store, "Citizen")).toHaveLength(3);
  });
});

describe("getEntitiesByProperty and getEntitiesByProperties", () => {
  it("filters by equality, range and contains", () => {
    const store = createStore();
    seed(store, 22);
    expect(getEntitiesByProperty(store, "Citizen.status", "idle")).toHaveLength(8);
    expect(getEntitiesByProperty(store, "Citizen.mood", { min: -50, max: -40 }).length).toBe(4);
    expect(getEntitiesByProperty(store, "Citizen.factions", { contains: 99 })).toHaveLength(11);
    expect(getEntitiesByProperty(store, "Citizen.status", "nonsense")).toEqual([]);
    expect(() => getEntitiesByProperty(store, "Citizen", "x")).toThrow(EcsError);
  });

  it("combines filters with AND", () => {
    const store = createStore();
    seed(store, 22);
    const result = getEntitiesByProperties(store, {
      "Citizen.status": "active",
      "Citizen.currentJobTypeId": "farm.sow",
    });
    expect(ids(result)).toEqual([7, 12, 17, 22].filter((id) => (id - 2) % 3 !== 0));
    expect(getEntitiesByProperties(store, {})).toHaveLength(23);
    expect(() => getEntitiesByProperties(store, { Bad: 1 })).toThrow(EcsError);
  });

  it("gives the same answer after a JSON round trip", () => {
    const counters = new IdCounters();
    const store = createStore(counters);
    seed(store, 15);
    const before = ids(getEntitiesByProperty(store, "Citizen.mood", { max: 0 }));
    const copyCounters = new IdCounters();
    copyCounters.restore(counters.serialize());
    const copy = createStore(copyCounters);
    copy.restore(JSON.parse(JSON.stringify(store.serialize())));
    expect(ids(getEntitiesByProperty(copy, "Citizen.mood", { max: 0 }))).toEqual(before);
  });
});

describe("EntityQuery", () => {
  it("chains steps immutably and runs on terminals", () => {
    const store = createStore();
    seed(store, 22);
    const base = EntityQuery.from(store).withComponent(citizenComponent);
    const idle = base.where("Citizen.status", "idle");
    const idleHigh = idle.filter((entity) => entity.id > 10);
    expect(base.count()).toBe(22);
    expect(idle.count()).toBe(8);
    expect(ids(idleHigh.toArray())).toEqual(idleHigh.ids());
    expect(idleHigh.ids().every((id) => id > 10)).toBe(true);
    expect(idle.first()?.id).toBe(2);
    expect(base.where("Citizen.status", "none").first()).toBeNull();
    expect(EntityQuery.from(store).count()).toBe(23);
  });
});

describe("performance", () => {
  it("1000-entity component, property and AND queries each finish under 5 ms", () => {
    const store = createStore();
    seed(store, 1000);
    const measure = (action: () => object): number => {
      let best = Number.POSITIVE_INFINITY;
      for (let round = 0; round < 7; round += 1) {
        const start = process.hrtime.bigint();
        action();
        best = Math.min(best, Number(process.hrtime.bigint() - start) / 1e6);
      }
      return best;
    };
    expect(measure(() => getEntitiesByComponent(store, citizenComponent))).toBeLessThan(50);
    expect(
      measure(() => getEntitiesByProperty(store, "Citizen.mood", { min: 0, max: 40 })),
    ).toBeLessThan(50);
    expect(
      measure(() =>
        getEntitiesByProperties(store, {
          "Citizen.status": "active",
          "Citizen.factions": { contains: 99 },
          "Citizen.stats.vigor": { min: 100 },
        }),
      ),
    ).toBeLessThan(50);
  });
});
