import { describe, expect, it } from "vitest";
import { maxRelationshipHistory, maxRelationships } from "../aiTypes";
import type { RelationshipEntry } from "../aiTypes";
import { relationshipsComponent, relationshipsDataSchema } from "./relationshipsComponent";

function entry(otherId: number, affinityMilli = 0): RelationshipEntry {
  return { otherId, affinityMilli, lastTick: 0, history: [] };
}

// @covers 013:FR-006 013:FR-007 013:SC-006
describe("relationshipsComponent", () => {
  it("defaults to no relationships", () => {
    expect(relationshipsComponent.name).toBe("Relationships");
    expect(relationshipsComponent.defaults()).toEqual({ entries: [] });
  });

  it("round trips JSON", () => {
    const data = {
      entries: [
        {
          otherId: 4,
          affinityMilli: -20_000,
          lastTick: 12,
          history: [{ kind: "gift", deltaMilli: 5000, tick: 12 }],
        },
        entry(9, 30_000),
      ],
    };
    expect(relationshipsDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects unsorted entries, too many entries or history and out of range affinity", () => {
    expect(relationshipsDataSchema.safeParse({ entries: [entry(5), entry(2)] }).success).toBe(
      false,
    );
    expect(
      relationshipsDataSchema.safeParse({
        entries: Array.from({ length: maxRelationships + 1 }, (_, index) => entry(index + 1)),
      }).success,
    ).toBe(false);
    expect(
      relationshipsDataSchema.safeParse({
        entries: [
          {
            ...entry(1),
            history: Array.from({ length: maxRelationshipHistory + 1 }, () => ({
              kind: "x",
              deltaMilli: 1,
              tick: 0,
            })),
          },
        ],
      }).success,
    ).toBe(false);
    expect(relationshipsDataSchema.safeParse({ entries: [entry(1, 100_001)] }).success).toBe(false);
  });
});
