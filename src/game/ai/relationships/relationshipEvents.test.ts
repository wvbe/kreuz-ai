import { describe, expect, it } from "vitest";
import type { Entity } from "../../ecs/Entity";
import { maxRelationshipHistory, maxRelationships } from "../aiTypes";
import type { RelationshipEntry, RelationshipsData } from "../aiTypes";
import {
  effectiveAffinityMilli,
  recordRelationshipEvent,
  relationshipHalfLifeTicks,
} from "./relationshipEvents";
import { relationshipsDataSchema } from "./relationshipsComponent";

function subject(id = 1): Entity {
  return { id, prototype: "farmer", components: { Relationships: { entries: [] } } };
}

function entriesOf(entity: Entity): RelationshipsData["entries"] {
  return (entity.components["Relationships"] as RelationshipsData).entries;
}

// @covers 013:FR-006 013:FR-007 013:SC-002 013:SC-006
describe("recordRelationshipEvent", () => {
  it("creates an entry per other entity, ascending, and moves the affinity by the delta", () => {
    const entity = subject();
    recordRelationshipEvent(entity, 9, "gift", 20_000, 5);
    recordRelationshipEvent(entity, 3, "contract_broken", -30_000, 6);
    const again = recordRelationshipEvent(entity, 9, "gift", 5000, 8);
    expect(again?.affinityMilli).toBe(25_000);
    expect(entriesOf(entity).map((entry) => entry.otherId)).toEqual([3, 9]);
    expect(again?.history.map((event) => event.kind)).toEqual(["gift", "gift"]);
    expect(again?.lastTick).toBe(8);
  });

  it("is asymmetric: the other entity keeps its own opinion", () => {
    const first = subject();
    const second = subject(2);
    recordRelationshipEvent(first, 2, "conflict", -40_000, 1);
    expect(entriesOf(second)).toEqual([]);
  });

  it("clamps the affinity and caps the history", () => {
    const entity = subject();
    for (let index = 0; index < maxRelationshipHistory + 3; index += 1) {
      recordRelationshipEvent(entity, 2, "gift", 40_000, index);
    }
    const entry = recordRelationshipEvent(entity, 2, "gift", 40_000, 20);
    expect(entry?.affinityMilli).toBe(100_000);
    expect(entry?.history).toHaveLength(maxRelationshipHistory);
  });

  it("evicts the relationship with the oldest last interaction at the limit", () => {
    const crowded = subject();
    for (let other = 1; other <= maxRelationships; other += 1) {
      recordRelationshipEvent(crowded, 100 + other, "chat", 1000, other === 5 ? 1 : 10 + other);
    }
    recordRelationshipEvent(crowded, 7, "chat", 1000, 99);
    const ids = entriesOf(crowded).map((item) => item.otherId);
    expect(ids).toHaveLength(maxRelationships);
    expect(ids).not.toContain(105);
    expect(ids[0]).toBe(7);
  });

  it("ignores entities without a Relationships component and survives JSON", () => {
    expect(
      recordRelationshipEvent({ id: 3, prototype: "wall", components: {} }, 1, "gift", 1, 1),
    ).toBeNull();
    const entity = subject();
    recordRelationshipEvent(entity, 4, "gift", 12_000, 3);
    const data = entity.components["Relationships"];
    expect(relationshipsDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
});

describe("effectiveAffinityMilli", () => {
  it("fades half of the affinity after the half-life and keeps the sign", () => {
    const entry = { otherId: 2, affinityMilli: 60_000, lastTick: 10, history: [] };
    expect(effectiveAffinityMilli(entry, 10)).toBe(60_000);
    expect(effectiveAffinityMilli(entry, 10 + relationshipHalfLifeTicks)).toBe(30_000);
    expect(effectiveAffinityMilli({ ...entry, affinityMilli: -60_000 }, 210)).toBe(-30_000);
    expect(effectiveAffinityMilli(entry, 5)).toBe(60_000);
  });

  it("lets old damage fade so that a recent gift outweighs it", () => {
    const entity = subject();
    const injury = recordRelationshipEvent(entity, 2, "contract_broken", -50_000, 0);
    expect(injury).not.toBeNull();
    expect(effectiveAffinityMilli(injury as RelationshipEntry, 400)).toBeGreaterThan(-20_000);
  });
});
