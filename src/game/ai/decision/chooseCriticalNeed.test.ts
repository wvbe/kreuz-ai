import { describe, expect, it } from "vitest";
import { createAiWorld, removeItems } from "../testAiWorld";
import type { AiTestWorld } from "../testAiWorld";
import { chooseCriticalNeed } from "./chooseCriticalNeed";

const noAi = { AiState: { treeId: null } };

function setNeed(world: AiTestWorld, id: number, needId: string, value: number): void {
  const needs = world.engine.store.require(id).components["Needs"] as {
    values: { needId: string; valueMilli: number }[];
  };
  const slot = needs.values.find((entry) => entry.needId === needId);
  if (slot) slot.valueMilli = value;
}

describe("chooseCriticalNeed", () => {
  it("returns null when no need is critical", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 4, noAi);
    expect(chooseCriticalNeed(world.engine, settler, 0)).toBeNull();
  });

  it("puts hunger first for a worker when hunger and rest are critical and bread is at hand", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 4, noAi);
    setNeed(world, settler.id, "hunger", 10_000);
    setNeed(world, settler.id, "rest", 10_000);
    expect(chooseCriticalNeed(world.engine, settler, 0)?.needId).toBe("hunger");
  });

  it("falls back to rest when hunger is critical but nothing can be eaten", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 4, noAi);
    removeItems(world, settler.id, "bread");
    setNeed(world, settler.id, "hunger", 10_000);
    setNeed(world, settler.id, "rest", 10_000);
    expect(chooseCriticalNeed(world.engine, settler, 0)?.needId).toBe("rest");
  });
});
