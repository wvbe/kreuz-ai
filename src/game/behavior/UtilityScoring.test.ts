import { describe, expect, it } from "vitest";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import { EntityStore } from "../ecs/EntityStore";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import { IdCounters } from "../engine/IdCounters";
import { BehaviorErrorKind } from "./BehaviorError";
import { pickBestCandidate } from "./UtilityScoring";
import type { BehaviorCandidate, UtilityContext, UtilityFactor } from "./UtilityScoring";

function context(): UtilityContext {
  const components = new ComponentRegistry();
  const prototypes = new PrototypeRegistry(components);
  prototypes.register({ id: "villager", components: {} });
  const store = new EntityStore({ components, prototypes, counters: new IdCounters() });
  const entity = store.spawn("villager");
  return { entityId: entity.id, entity, tick: 3, store };
}

const candidates: BehaviorCandidate[] = [
  { treeId: "work", base: 10 },
  { treeId: "eat", base: 5 },
  { treeId: "sleep", base: 5 },
];

describe("pickBestCandidate", () => {
  it("returns null without candidates", () => {
    expect(pickBestCandidate([], [], context())).toBeNull();
  });

  it("picks the highest base score and breaks ties by lowest index", () => {
    expect(pickBestCandidate(candidates, [], context())?.treeId).toBe("work");
    expect(pickBestCandidate(candidates.slice(1), [], context())?.treeId).toBe("eat");
  });

  it("adds the integer scores of all factors to the base (SC-011)", () => {
    const hunger: UtilityFactor = {
      id: "hunger",
      score: (_context, candidate) => (candidate.treeId === "eat" ? 20 : 0),
    };
    const danger: UtilityFactor = {
      id: "danger",
      score: (_context, candidate) => (candidate.treeId === "sleep" ? 30 : -1),
    };
    expect(pickBestCandidate(candidates, [hunger], context())?.treeId).toBe("eat");
    expect(pickBestCandidate(candidates, [hunger, danger], context())?.treeId).toBe("sleep");
    expect(pickBestCandidate(candidates, [danger, hunger], context())?.treeId).toBe("sleep");
  });

  it("rejects non-integer factor scores", () => {
    const sloppy: UtilityFactor = { id: "sloppy", score: () => 0.5 };
    expect(() => pickBestCandidate(candidates, [sloppy], context())).toThrow(
      expect.objectContaining({ kind: BehaviorErrorKind.InvalidDefinition }),
    );
  });
});
