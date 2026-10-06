import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import { AnimalKind } from "../content/contentTypes";
import type { JsonValue } from "../engine/EventBus";
import { noAiOverride } from "../jobs/testJobWorld";
import { buildAnimalsView } from "./animalViews";

describe("buildAnimalsView", () => {
  it("lists animals only, ascending by id, with position, health and what they hold", () => {
    const world = createAiWorld();
    world.spawn("peasant", 0, noAiOverride);
    const sheep = world.spawn("sheep", 3, noAiOverride);
    const deer = world.spawn("deer", 4, noAiOverride);
    const inventory = sheep.components["Inventory"] as { slots: JsonValue[] };
    inventory.slots.push({
      materialId: "raw_wool",
      quantity: 2,
      remainingMilli: null,
      decayRateMilli: null,
    });
    const view = buildAnimalsView(world.engine);
    expect(view.animals.map((row) => row.entityId)).toEqual([sheep.id, deer.id]);
    expect(view.animals[0]).toMatchObject({
      prototypeId: "sheep",
      kind: AnimalKind.Livestock,
      mapId: world.mapId,
      cellIndex: 3,
      hungerMilli: 0,
      healthMilli: 100_000,
      held: [{ materialId: "raw_wool", quantity: 2 }],
      action: "idle",
    });
  });

  it("filters by kind and prototype", () => {
    const world = createAiWorld();
    world.spawn("sheep", 3, noAiOverride);
    world.spawn("deer", 4, noAiOverride);
    world.spawn("deer", 5, noAiOverride);
    expect(buildAnimalsView(world.engine, { kind: AnimalKind.Wild }).animals).toHaveLength(2);
    expect(buildAnimalsView(world.engine, { kind: AnimalKind.Livestock }).animals).toHaveLength(1);
    expect(buildAnimalsView(world.engine, { prototypeId: "deer" }).animals).toHaveLength(2);
    expect(buildAnimalsView(world.engine, { prototypeId: "wolf" }).animals).toHaveLength(0);
  });

  it("shows what an animal is doing", () => {
    const world = createAiWorld();
    const rabbit = world.spawn("rabbit", 55);
    world.run(20);
    const row = buildAnimalsView(world.engine).animals.find(
      (entry) => entry.entityId === rabbit.id,
    );
    expect(row?.action).toMatch(/^(idle|stand around|move to cell \d+)$/);
  });
});
