import { describe, expect, it } from "vitest";
import { z } from "zod";
import { IdCounters } from "../engine/IdCounters";
import { ComponentRegistry, defineComponent } from "./ComponentRegistry";
import { EcsError, EcsErrorKind } from "./EcsError";
import { EntityStore } from "./EntityStore";
import { PrototypeRegistry } from "./PrototypeRegistry";
import { RelationshipDirection, RelationshipRegistry } from "./RelationshipRegistry";
import {
  clearReferencesTo,
  getRelatedEntities,
  getRelatedEntity,
  getRelatedIds,
  maxTraversalDepth,
  traverseRelated,
} from "./relationshipQueries";

const citizenComponent = defineComponent(
  "Citizen",
  z
    .object({
      factions: z.array(z.number().int()),
      currentJobPostingId: z.number().int().nullable(),
      mentorId: z.number().int().nullable(),
      broken: z.string(),
    })
    .strict(),
  () => ({ factions: [], currentJobPostingId: null, mentorId: null, broken: "" }),
);
const factionComponent = defineComponent(
  "Faction",
  z.object({ leaderId: z.number().int().nullable() }).strict(),
  () => ({ leaderId: null }),
);

function setup(counters: IdCounters = new IdCounters()): {
  store: EntityStore;
  relationships: RelationshipRegistry;
  counters: IdCounters;
} {
  const components = new ComponentRegistry();
  components.register(citizenComponent);
  components.register(factionComponent);
  const prototypes = new PrototypeRegistry(components);
  prototypes.register({ id: "citizen", components: { Citizen: {} } });
  prototypes.register({ id: "faction", components: { Faction: {} } });
  const relationships = new RelationshipRegistry();
  relationships.registerPair({
    forwardName: "factions",
    inverseName: "members",
    component: "Citizen",
    field: "factions",
    forwardMany: true,
  });
  relationships.registerPair({
    forwardName: "mentor",
    inverseName: "students",
    component: "Citizen",
    field: "mentorId",
    forwardMany: false,
  });
  relationships.register({
    name: "leader",
    component: "Faction",
    field: "leaderId",
    direction: RelationshipDirection.Forward,
    many: false,
  });
  return {
    store: new EntityStore({ components, prototypes, counters }),
    relationships,
    counters,
  };
}

function ids(entities: { id: number }[]): number[] {
  return entities.map((entity) => entity.id);
}

describe("getRelatedIds / getRelatedEntities", () => {
  // @covers 002:FR-005
  it("resolves both directions with ascending ids", () => {
    const { store, relationships } = setup();
    const factionA = store.spawn("faction");
    const factionB = store.spawn("faction");
    for (let index = 0; index < 50; index += 1) {
      store.spawn("citizen", {
        Citizen: { factions: index % 2 === 0 ? [factionB.id, factionA.id] : [factionA.id] },
      });
    }
    expect(getRelatedEntities(store, relationships, factionA.id, "members")).toHaveLength(50);
    expect(getRelatedEntities(store, relationships, factionB.id, "members")).toHaveLength(25);
    expect(getRelatedIds(store, relationships, 3, "factions")).toEqual([1, 2]);
    expect(ids(getRelatedEntities(store, relationships, 3, "factions"))).toEqual([1, 2]);
    const members = getRelatedIds(store, relationships, factionA.id, "members");
    expect([...members].sort((left, right) => left - right)).toEqual(members);
  });

  it("returns empty lists and handles null single references", () => {
    const { store, relationships } = setup();
    const faction = store.spawn("faction");
    const citizen = store.spawn("citizen");
    expect(getRelatedIds(store, relationships, faction.id, "members")).toEqual([]);
    expect(getRelatedIds(store, relationships, citizen.id, "mentor")).toEqual([]);
    expect(getRelatedIds(store, relationships, faction.id, "factions")).toEqual([]);
  });

  // @covers 002:FR-005
  // @covers 002:FR-006
  it("throws on a dangling forward reference and for unknown entities or relationships", () => {
    const { store, relationships } = setup();
    const citizen = store.spawn("citizen", { Citizen: { factions: [99] } });
    try {
      getRelatedEntities(store, relationships, citizen.id, "factions");
      expect.unreachable();
    } catch (failure) {
      expect((failure as EcsError).kind).toBe(EcsErrorKind.DanglingReference);
    }
    expect(() => getRelatedIds(store, relationships, 99, "factions")).toThrow(EcsError);
    expect(() => getRelatedIds(store, relationships, citizen.id, "nope")).toThrow(EcsError);
  });

  it("rejects a field that does not hold ids", () => {
    const { store, relationships } = setup();
    relationships.register({
      name: "broken",
      component: "Citizen",
      field: "broken",
      direction: RelationshipDirection.Forward,
      many: false,
    });
    const citizen = store.spawn("citizen", { Citizen: { broken: "text" } });
    expect(() => getRelatedIds(store, relationships, citizen.id, "broken")).toThrow(EcsError);
  });

  // @covers 002:FR-008
  // @covers 002:SC-007
  it("works identically after a JSON round trip", () => {
    const { store, relationships, counters } = setup();
    store.spawn("faction");
    store.spawn("citizen", { Citizen: { factions: [1] } });
    const copyCounters = new IdCounters();
    copyCounters.restore(counters.serialize());
    const copy = setup(copyCounters);
    copy.store.restore(JSON.parse(JSON.stringify(store.serialize())));
    expect(getRelatedIds(copy.store, relationships, 1, "members")).toEqual([2]);
  });
});

describe("getRelatedEntity", () => {
  // @covers 002:FR-006
  it("returns the lowest-id target, or null", () => {
    const { store, relationships } = setup();
    store.spawn("faction");
    store.spawn("faction");
    const citizen = store.spawn("citizen", { Citizen: { factions: [2, 1] } });
    expect(getRelatedEntity(store, relationships, citizen.id, "factions")?.id).toBe(1);
    expect(getRelatedEntity(store, relationships, 1, "leader")).toBeNull();
    store.require(1).components["Faction"]!["leaderId"] = citizen.id;
    expect(getRelatedEntity(store, relationships, 1, "leader")?.id).toBe(citizen.id);
  });
});

describe("traverseRelated", () => {
  it("follows chains breadth first and terminates on cycles", () => {
    const { store, relationships } = setup();
    const first = store.spawn("citizen");
    const second = store.spawn("citizen", { Citizen: { mentorId: first.id } });
    const third = store.spawn("citizen", { Citizen: { mentorId: second.id } });
    first.components["Citizen"]!["mentorId"] = third.id;
    expect(ids(traverseRelated(store, relationships, first.id, "mentor"))).toEqual([3, 2]);
    expect(ids(traverseRelated(store, relationships, first.id, "mentor", 1))).toEqual([3]);
    expect(ids(traverseRelated(store, relationships, first.id, "students"))).toEqual([2, 3]);
  });

  // @covers 002:SC-004
  it("limits and validates depth", () => {
    const { store, relationships } = setup();
    let previous = store.spawn("citizen");
    for (let count = 0; count < 8; count += 1) {
      previous = store.spawn("citizen", { Citizen: { mentorId: previous.id } });
    }
    expect(traverseRelated(store, relationships, previous.id, "mentor")).toHaveLength(
      maxTraversalDepth,
    );
    for (const bad of [0, 6, 1.5]) {
      expect(() => traverseRelated(store, relationships, previous.id, "mentor", bad)).toThrow(
        EcsError,
      );
    }
  });
});

describe("clearReferencesTo", () => {
  // @covers 002:FR-006a
  it("nulls single references and drops list entries, including pending deletes", () => {
    const { store, relationships } = setup();
    const faction = store.spawn("faction");
    const other = store.spawn("faction");
    const leader = store.spawn("citizen", { Citizen: { factions: [faction.id, other.id] } });
    faction.components["Faction"]!["leaderId"] = leader.id;
    other.components["Faction"]!["leaderId"] = leader.id;
    const student = store.spawn("citizen", { Citizen: { mentorId: leader.id } });
    store.requestDelete(student.id);
    expect(clearReferencesTo(store, relationships, leader.id)).toBe(3);
    expect(faction.components["Faction"]?.["leaderId"]).toBeNull();
    expect(student.components["Citizen"]?.["mentorId"]).toBeNull();
    expect(clearReferencesTo(store, relationships, faction.id)).toBe(1);
    expect(leader.components["Citizen"]?.["factions"]).toEqual([other.id]);
    expect(clearReferencesTo(store, relationships, 999)).toBe(0);
  });
});
