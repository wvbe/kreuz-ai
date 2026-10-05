import { describe, expect, it } from "vitest";
import { BlockReason } from "../../map/mapTypes";
import { TaskStatus } from "../../task/taskTypes";
import { createAiWorld } from "../testAiWorld";
import type { AiTestWorld } from "../testAiWorld";
import { AiTaskPriority, AiTaskType } from "../aiTypes";
import { createMoveTask, moveTaskData } from "./moveTask";

const noAi = { AiState: { treeId: null } };

function cellOf(world: AiTestWorld, id: number): number {
  return (world.engine.store.require(id).components["Position"] as { cellIndex: number }).cellIndex;
}

function startMove(world: AiTestWorld, id: number, target: number): void {
  world.engine.tasks.enqueue(id, {
    type: AiTaskType.Move,
    data: moveTaskData(world.mapId, target),
    priority: AiTaskPriority.Idle,
  });
}

function lastOutcome(world: AiTestWorld, id: number): { outcome: string; reason: string | null } {
  const history = world.engine.tasks.getQueue(id)?.history ?? [];
  const last = history[history.length - 1];
  return { outcome: last?.outcome ?? "none", reason: last?.reason ?? null };
}

describe("moveTaskData", () => {
  it("is the map and target as JSON", () => {
    expect(moveTaskData(2, 17)).toEqual({ mapId: 2, target: 17 });
  });
});

describe("createMoveTask", () => {
  it("registers under the task type `move` and needs a Position", () => {
    const world = createAiWorld();
    const handler = createMoveTask(world.engine);
    expect(handler.type).toBe("move");
    expect(handler.requires).toEqual(["Position"]);
    expect(world.engine.taskHandlers.has("move")).toBe(true);
  });

  it("walks one cell per tick on normal terrain and reports the events", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 0, noAi);
    const events: string[] = [];
    world.engine.bus.subscribe("entity.movement.**", (payload, event) => {
      events.push(`${event.name} ${JSON.stringify(payload)}`);
    });
    startMove(world, settler.id, 3);
    const cells: number[] = [];
    for (let tick = 0; tick < 3; tick += 1) {
      world.run(1);
      cells.push(cellOf(world, settler.id));
    }
    expect(cells).toEqual([1, 2, 3]);
    expect(lastOutcome(world, settler.id).outcome).toBe(TaskStatus.Completed);
    expect(events).toEqual([
      `entity.movement.started {"entityId":${settler.id},"mapId":1,"fromCell":0,"toCell":1}`,
      `entity.movement.completed {"entityId":${settler.id},"mapId":1,"cellIndex":3}`,
    ]);
    expect(world.engine.maps.queryCell(world.mapId, 3).occupants).toContain(settler.id);
    expect(world.engine.maps.queryCell(world.mapId, 0).occupants).not.toContain(settler.id);
  });

  it("is slower on costly terrain: forest costs 15 against a speed of 10", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 0, noAi);
    const map = world.engine.maps.require(world.mapId);
    map.setTerrain(1, "forest_oak");
    map.setTerrain(2, "forest_oak");
    startMove(world, settler.id, 3);
    const cells: number[] = [];
    for (let tick = 0; tick < 4; tick += 1) {
      world.run(1);
      cells.push(cellOf(world, settler.id));
    }
    expect(cells).toEqual([0, 1, 2, 3]);
  });

  it("is faster on roads: leftover progress carries over to the next tick", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 0, noAi);
    const map = world.engine.maps.require(world.mapId);
    for (const cell of [1, 2, 3, 4]) {
      map.setTerrain(cell, "road_dirt");
    }
    startMove(world, settler.id, 4);
    const cells: number[] = [];
    for (let tick = 0; tick < 3; tick += 1) {
      world.run(1);
      cells.push(cellOf(world, settler.id));
    }
    expect(cells).toEqual([1, 2, 4]);
    expect(lastOutcome(world, settler.id).outcome).toBe(TaskStatus.Completed);
  });

  it("finishes at once when the entity already stands on the target", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 5, noAi);
    startMove(world, settler.id, 5);
    world.run(1);
    expect(lastOutcome(world, settler.id).outcome).toBe(TaskStatus.Completed);
    expect(cellOf(world, settler.id)).toBe(5);
  });

  it("fails with `unreachable` when the target cannot be entered", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 0, noAi);
    world.engine.maps.require(world.mapId).setTerrain(7, "water_shallow");
    startMove(world, settler.id, 7);
    world.run(1);
    expect(lastOutcome(world, settler.id)).toEqual({ outcome: "Failed", reason: "unreachable" });
  });

  it("fails with `unreachable` for a target on another map", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 0, noAi);
    world.engine.tasks.enqueue(settler.id, {
      type: AiTaskType.Move,
      data: moveTaskData(world.mapId + 1, 3),
    });
    world.run(1);
    expect(lastOutcome(world, settler.id)).toEqual({ outcome: "Failed", reason: "unreachable" });
  });

  it("re-plans around a cell that becomes blocked", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 0, noAi);
    startMove(world, settler.id, 4);
    world.run(1);
    expect(cellOf(world, settler.id)).toBe(1);
    world.engine.maps.require(world.mapId).setObstruction(2, BlockReason.Wall);
    const visited: number[] = [];
    for (let tick = 0; tick < 10 && cellOf(world, settler.id) !== 4; tick += 1) {
      world.run(1);
      visited.push(cellOf(world, settler.id));
    }
    expect(cellOf(world, settler.id)).toBe(4);
    expect(visited).not.toContain(2);
    expect(lastOutcome(world, settler.id).outcome).toBe(TaskStatus.Completed);
  });

  it("fails with `unreachable` when the target itself gets blocked", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 0, noAi);
    startMove(world, settler.id, 4);
    world.run(1);
    world.engine.maps.require(world.mapId).setObstruction(4, BlockReason.Wall);
    world.run(5);
    expect(lastOutcome(world, settler.id)).toEqual({ outcome: "Failed", reason: "unreachable" });
  });

  it("gives up with `blocked` after too many re-plans", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 0, noAi);
    startMove(world, settler.id, 9);
    world.run(1);
    const map = world.engine.maps.require(world.mapId);
    // Keep walling off whichever cell is next so that every re-plan is invalidated again.
    for (let tick = 0; tick < 30; tick += 1) {
      const task = world.engine.tasks.getRunningTask(settler.id);
      if (task === undefined) {
        break;
      }
      const data = task.data as { path: number[] };
      const next = data.path[0];
      if (next !== undefined && next !== 9) {
        map.setObstruction(next, BlockReason.Wall);
      }
      world.run(1);
    }
    expect(["blocked", "unreachable"]).toContain(lastOutcome(world, settler.id).reason);
    expect(lastOutcome(world, settler.id).outcome).toBe("Failed");
  });
});
