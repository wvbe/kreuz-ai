import { describe, expect, it } from "vitest";
import { AiTaskType } from "../ai/aiTypes";
import { createAiWorld } from "../ai/testAiWorld";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { noAiOverride } from "../jobs/testJobWorld";
import { createZoneWorld } from "../zones/testZoneWorld";
import { taskQueueComponent } from "../task/taskQueueComponent";
import { animalContentOf } from "./animalSenses";
import {
  cellsAround,
  enqueueMove,
  enqueueStand,
  fleeAnimal,
  grazeAnimal,
  hasTaskAtLeast,
  isOutsidePen,
  penTilesOf,
  returnToPen,
  pickFleeCell,
  roamTerrainOf,
  wanderAnimal,
} from "./animalMovement";
import { FaunaTaskPriority, fleeDistanceCost } from "./faunaTypes";

function cellOf(entity: Entity): number {
  return (entity.components["Position"] as { cellIndex: number }).cellIndex;
}

function tasksOf(entity: Entity): { type: string; priority: number; data: JsonValue }[] {
  return (getComponent(entity, taskQueueComponent)?.tasks ?? []).map((task) => ({
    type: task.type,
    priority: task.priority,
    data: task.data,
  }));
}

describe("animal movement", () => {
  it("lists the cells around an animal by cost and then cell", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 55, noAiOverride);
    const cells = cellsAround(world.engine, deer, 10);
    expect(cells[0]).toEqual({ cell: 55, cost: 0 });
    expect(cells.slice(1).map((entry) => entry.cell)).toEqual([45, 54, 56, 65]);
  });

  it("restricts roaming to habitat and diet terrain", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 0, noAiOverride);
    const content = animalContentOf(world.engine, deer);
    expect(content).toBeDefined();
    if (content !== undefined) {
      expect(roamTerrainOf(content)).toEqual([
        "forest_oak",
        "forest_pine",
        "forest_birch",
        "grassland",
        "fertile_soil",
      ]);
    }
  });

  it("enqueues moves and stands and reports tasks by priority", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 0, noAiOverride);
    expect(hasTaskAtLeast(deer, 0)).toBe(false);
    enqueueStand(world.engine, deer, 5, 10);
    expect(hasTaskAtLeast(deer, 10)).toBe(true);
    expect(hasTaskAtLeast(deer, 11)).toBe(false);
    enqueueMove(world.engine, deer, 33, FaunaTaskPriority.Flee);
    expect(tasksOf(deer)).toEqual([
      { type: AiTaskType.Idle, priority: 10, data: { ticks: 5 } },
      { type: AiTaskType.Move, priority: 60, data: { mapId: world.mapId, target: 33 } },
    ]);
  });

  it("wanders: stands or walks over its own terrain, and not while busy", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 55, noAiOverride);
    const content = animalContentOf(world.engine, deer);
    if (content === undefined) {
      throw new Error("deer content missing");
    }
    wanderAnimal(world.engine, deer, content);
    const first = tasksOf(deer);
    expect(first).toHaveLength(1);
    expect([AiTaskType.Idle, AiTaskType.Move]).toContain(first[0]?.type);
    wanderAnimal(world.engine, deer, content);
    expect(tasksOf(deer)).toHaveLength(1);
  });

  it("only wanders over terrain of its roam list", () => {
    const world = createAiWorld();
    const map = world.engine.maps.require(world.mapId);
    for (let cell = 0; cell < 100; cell += 1) {
      map.setTerrain(cell, "stone_deposit");
    }
    map.setTerrain(55, "grassland");
    map.setTerrain(56, "grassland");
    const rabbit = world.spawn("rabbit", 55, noAiOverride);
    const content = animalContentOf(world.engine, rabbit);
    if (content === undefined) {
      throw new Error("rabbit content missing");
    }
    for (let round = 0; round < 12; round += 1) {
      wanderAnimal(world.engine, rabbit, content);
      const task = tasksOf(rabbit)[0];
      if (task?.type === AiTaskType.Move) {
        expect((task.data as { target: number }).target).toBe(56);
      }
      world.engine.tasks.interrupt(rabbit.id);
      world.engine.runTicks(2);
    }
  });

  it("grazes: eats where it stands on diet terrain, otherwise walks to the nearest food", () => {
    const world = createAiWorld();
    const sheep = world.spawn("sheep", 55, noAiOverride);
    const content = animalContentOf(world.engine, sheep);
    if (content === undefined) {
      throw new Error("sheep content missing");
    }
    expect(grazeAnimal(world.engine, sheep, content)).toBe(true);
    expect(tasksOf(sheep)[0]?.type).toBe(AiTaskType.Idle);
    world.engine.tasks.interrupt(sheep.id);
    world.engine.runTicks(2);
    const map = world.engine.maps.require(world.mapId);
    map.setTerrain(55, "forest_oak");
    expect(grazeAnimal(world.engine, sheep, content)).toBe(true);
    const task = tasksOf(sheep)[0];
    expect(task?.type).toBe(AiTaskType.Move);
    expect([45, 54, 56, 65]).toContain((task?.data as { target: number }).target);
  });

  it("cannot graze without diet terrain in reach or without a diet", () => {
    const world = createAiWorld();
    const map = world.engine.maps.require(world.mapId);
    for (let cell = 0; cell < 100; cell += 1) {
      map.setTerrain(cell, "forest_oak");
    }
    const sheep = world.spawn("sheep", 55, noAiOverride);
    const sheepContent = animalContentOf(world.engine, sheep);
    const bear = world.spawn("bear", 44, noAiOverride);
    const bearContent = animalContentOf(world.engine, bear);
    if (sheepContent === undefined || bearContent === undefined) {
      throw new Error("content missing");
    }
    expect(grazeAnimal(world.engine, sheep, sheepContent)).toBe(false);
    expect(grazeAnimal(world.engine, bear, { ...bearContent, dietTerrainIds: [] })).toBe(false);
  });

  it("picks the reachable cell farthest from the threat", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 55, noAiOverride);
    const target = pickFleeCell(world.engine, deer, 54);
    expect(target).not.toBeNull();
    const column = (target as number) % 10;
    expect(column).toBeGreaterThan(5);
    expect(
      cellsAround(world.engine, deer, fleeDistanceCost).some((entry) => entry.cell === target),
    ).toBe(true);
  });

  it("finds no flee cell on a map without room", () => {
    const world = createAiWorld({ width: 1, height: 1 });
    const deer = world.spawn("deer", 0, noAiOverride);
    expect(pickFleeCell(world.engine, deer, 0)).toBeNull();
    expect(fleeAnimal(world.engine, deer, 0)).toBe(false);
  });

  it("flees: a run at flee priority and a freeze", () => {
    const world = createAiWorld();
    const deer = world.spawn("deer", 55, noAiOverride);
    expect(fleeAnimal(world.engine, deer, 54)).toBe(true);
    const tasks = tasksOf(deer);
    expect(tasks.map((task) => task.type)).toEqual([AiTaskType.Move, AiTaskType.Idle]);
    expect(tasks.every((task) => task.priority === FaunaTaskPriority.Flee)).toBe(true);
  });

  it("knows the pen of livestock: the active zones of its zone type on its map", () => {
    const world = createZoneWorld();
    const sheep = world.spawn("sheep", 55, noAiOverride);
    const deer = world.spawn("deer", 56, noAiOverride);
    const content = animalContentOf(world.engine, sheep);
    const wild = animalContentOf(world.engine, deer);
    if (content === undefined || wild === undefined) {
      throw new Error("content missing");
    }
    expect(penTilesOf(world.engine, sheep, content)).toBeNull();
    const cells = world.rect(2, 2, 4, 3);
    const [zoneId] = world.designate("pasture", cells);
    world.run(2);
    expect(zoneId === undefined ? undefined : world.zoneData(zoneId).active).toBe(false);
    expect(penTilesOf(world.engine, sheep, content)).toBeNull();
    world.furniture(22, "trough");
    world.run(2);
    expect(
      [...(penTilesOf(world.engine, sheep, content) ?? [])].sort((left, right) => left - right),
    ).toEqual([...cells].sort((left, right) => left - right));
    expect(penTilesOf(world.engine, deer, wild)).toBeNull();
    expect(isOutsidePen(world.engine, sheep, content)).toBe(true);
    expect(isOutsidePen(world.engine, deer, wild)).toBe(false);
  });

  it("walks back to the nearest cell of the pen and stays in it once there", () => {
    const world = createZoneWorld();
    const cells = world.rect(2, 2, 4, 3);
    world.designate("pasture", cells);
    world.furniture(22, "trough");
    const sheep = world.spawn("sheep", 99, noAiOverride);
    world.run(2);
    const content = animalContentOf(world.engine, sheep);
    if (content === undefined) {
      throw new Error("content missing");
    }
    expect(returnToPen(world.engine, sheep, content)).toBe(true);
    world.run(150);
    expect(isOutsidePen(world.engine, sheep, content)).toBe(false);
    expect(returnToPen(world.engine, sheep, content)).toBe(false);
    for (let round = 0; round < 25; round += 1) {
      wanderAnimal(world.engine, sheep, content);
      world.run(40);
      expect(cells).toContain(cellOf(sheep));
    }
  });

  it("cannot return to a pen it cannot reach, and does not graze outside the pen", () => {
    const world = createZoneWorld();
    const cells = world.rect(2, 2, 4, 3);
    world.designate("pasture", cells);
    world.furniture(22, "trough");
    const map = world.engine.maps.require(world.mapId);
    const sheep = world.spawn("sheep", 0, noAiOverride);
    world.run(2);
    for (const cell of [1, 10, 11]) {
      map.setTerrain(cell, "water_shallow");
    }
    const content = animalContentOf(world.engine, sheep);
    if (content === undefined) {
      throw new Error("content missing");
    }
    expect(returnToPen(world.engine, sheep, content)).toBe(false);
    const inside = world.spawn("sheep", 33, noAiOverride);
    for (const cell of cells) {
      map.setTerrain(cell, "forest_oak");
    }
    expect(grazeAnimal(world.engine, inside, content)).toBe(false);
  });
});
