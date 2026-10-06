import { describe, expect, it } from "vitest";
import { createAiWorld } from "../ai/testAiWorld";
import type { JsonValue } from "../engine/EventBus";
import { getComponent } from "../ecs/Entity";
import { getTotal } from "../inventory/inventoryQueries";
import { noAiOverride } from "../jobs/testJobWorld";
import { animalComponent } from "./animalComponent";
import { runFaunaTick, tickAnimal } from "./runFaunaTick";
import { animalEatPerTick, animalHungerPerTick, animalProducedEvent } from "./faunaTypes";

describe("fauna tick", () => {
  it("makes an animal hungrier, and less hungry on its diet terrain", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 0, noAiOverride);
    const animal = getComponent(sheep, animalComponent);
    world.engine.maps.require(world.mapId).setTerrain(0, "forest_oak");
    tickAnimal(world.engine, sheep, 1);
    expect(animal?.hungerMilli).toBe(animalHungerPerTick);
    world.engine.maps.require(world.mapId).setTerrain(0, "grassland");
    if (animal !== undefined) {
      animal.hungerMilli = 5_000;
    }
    tickAnimal(world.engine, sheep, 2);
    expect(animal?.hungerMilli).toBe(5_000 + animalHungerPerTick - animalEatPerTick);
    if (animal !== undefined) {
      animal.hungerMilli = 0;
    }
    tickAnimal(world.engine, sheep, 3);
    expect(animal?.hungerMilli).toBe(0);
  });

  it("schedules the first product and delivers one every interval into the animal", () => {
    const world = createAiWorld();
    const cow = world.spawn("cow", 0, noAiOverride);
    const seen: JsonValue[] = [];
    world.engine.bus.subscribe(animalProducedEvent, (payload) => seen.push(payload));
    tickAnimal(world.engine, cow, 10);
    expect(getComponent(cow, animalComponent)?.nextProductTick).toBe(10 + 288);
    tickAnimal(world.engine, cow, 297);
    expect(getTotal(cow, "milk")).toBe(0);
    tickAnimal(world.engine, cow, 298);
    expect(getTotal(cow, "milk")).toBe(3);
    expect(getComponent(cow, animalComponent)?.nextProductTick).toBe(298 + 288);
    world.engine.bus.processQueue();
    expect(seen).toEqual([{ entityId: cow.id, prototypeId: "cow" }]);
  });

  it("makes nothing for animals without a periodic product", () => {
    const world = createAiWorld();
    const horse = world.spawn("horse", 0, noAiOverride);
    tickAnimal(world.engine, horse, 10);
    tickAnimal(world.engine, horse, 100_000);
    expect(getComponent(horse, animalComponent)?.nextProductTick).toBe(0);
  });

  it("loses the yield of a period when the inventory has no room", () => {
    const world = createAiWorld();
    const chicken = world.spawn("chicken", 0, noAiOverride);
    const inventory = chicken.components["Inventory"] as { slotCount: number };
    inventory.slotCount = 0;
    tickAnimal(world.engine, chicken, 1);
    tickAnimal(world.engine, chicken, 300);
    expect(getTotal(chicken, "eggs")).toBe(0);
  });

  it("runs every animal in the world and ignores other entities", () => {
    const world = createAiWorld();
    world.engine.maps.require(world.mapId).setTerrain(0, "forest_pine");
    const deer = world.spawn("deer", 0, noAiOverride);
    const peasant = world.spawn("peasant", 1, noAiOverride);
    runFaunaTick(world.engine, 1);
    expect(getComponent(deer, animalComponent)?.hungerMilli).toBe(animalHungerPerTick);
    expect(getComponent(peasant, animalComponent)).toBeUndefined();
  });
});
