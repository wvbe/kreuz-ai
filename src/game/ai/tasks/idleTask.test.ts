import { describe, expect, it } from "vitest";
import { TaskStatus } from "../../task/taskTypes";
import { AiTaskType } from "../aiTypes";
import { createAiWorld } from "../testAiWorld";
import { createIdleTask, idleTaskData } from "./idleTask";

describe("idleTaskData", () => {
  it("is the number of ticks as JSON", () => {
    expect(idleTaskData(7)).toEqual({ ticks: 7 });
  });
});

describe("createIdleTask", () => {
  it("has the type ai.idle", () => {
    expect(createIdleTask().type).toBe("ai.idle");
  });

  it("stands still for the given ticks, as a serialized wait, then finishes", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 3, { AiState: { treeId: null } });
    world.engine.tasks.enqueue(settler.id, { type: AiTaskType.Idle, data: idleTaskData(5) });
    world.run(1);
    const waiting = world.engine.tasks.getQueue(settler.id)?.tasks[0];
    expect(waiting?.status).toBe(TaskStatus.Waiting);
    expect(waiting?.waitFor).toEqual({ kind: "until-tick", tick: 6 });
    world.run(4);
    expect(world.engine.tasks.getQueue(settler.id)?.tasks).toHaveLength(1);
    world.run(1);
    expect(world.engine.tasks.getQueue(settler.id)?.tasks).toEqual([]);
    expect(world.engine.tasks.getQueue(settler.id)?.history.at(-1)?.outcome).toBe(
      TaskStatus.Completed,
    );
    expect((settler.components["Position"] as { cellIndex: number }).cellIndex).toBe(3);
  });

  it("rejects invalid data", () => {
    const world = createAiWorld();
    const settler = world.spawn("peasant", 0, { AiState: { treeId: null } });
    world.engine.tasks.enqueue(settler.id, { type: AiTaskType.Idle, data: { ticks: 0 } });
    expect(() => world.run(1)).toThrow();
  });
});
