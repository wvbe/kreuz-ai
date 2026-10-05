import { describe, expect, it } from "vitest";
import type { Entity } from "../../ecs/Entity";
import { summarizeRelationships } from "./relationshipSummary";

describe("summarizeRelationships", () => {
  it("is empty without the component or entries", () => {
    expect(summarizeRelationships({ id: 1, prototype: "x", components: {} })).toEqual({
      count: 0,
      meanAffinityMilli: 0,
    });
    const empty: Entity = { id: 1, prototype: "x", components: { Relationships: { entries: [] } } };
    expect(summarizeRelationships(empty).count).toBe(0);
  });

  it("counts entries and takes the integer mean of the affinities", () => {
    const subject: Entity = {
      id: 1,
      prototype: "x",
      components: {
        Relationships: {
          entries: [
            { otherId: 2, affinityMilli: 10_000, lastTick: 0, history: [] },
            { otherId: 3, affinityMilli: -3_001, lastTick: 0, history: [] },
          ],
        },
      },
    };
    expect(summarizeRelationships(subject)).toEqual({ count: 2, meanAffinityMilli: 3_499 });
  });
});
