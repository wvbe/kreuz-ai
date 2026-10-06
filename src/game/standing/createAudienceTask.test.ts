import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { positionComponent } from "../map/positionComponent";
import { TaskStatus } from "../task/taskTypes";
import { createAudienceTask } from "./createAudienceTask";
import { findSeat } from "./findSeat";
import { audienceTaskPriority, audienceTaskType } from "./standingTypes";
import { createStandingWorld } from "./testStandingWorld";

function taskOf(world: ReturnType<typeof createStandingWorld>, entityId: number) {
  return world.engine.tasks
    .getQueue(entityId)
    ?.tasks.find((task) => task.type === audienceTaskType);
}

describe("createAudienceTask", () => {
  it("is the handler of govern.steward_audience and needs a position", () => {
    const world = createStandingWorld();
    const handler = createAudienceTask(world.engine);
    expect(handler.type).toBe("govern.steward_audience");
    expect(handler.requires).toEqual(["Position"]);
  });

  // @covers 026:FR-015
  it("walks to the throne room, stays stewardAudienceTicks and is done", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.throneRoom(5, 5);
    const steward = world.steward(2);
    world.engine.tasks.enqueue(steward.id, {
      type: audienceTaskType,
      data: {},
      priority: audienceTaskPriority,
    });
    const seat = findSeat(world.engine);
    let arrived = -1;
    let finished = -1;
    for (let tick = 1; tick <= 200 && finished < 0; tick += 1) {
      world.run(1);
      const place = getComponent(steward, positionComponent);
      if (arrived < 0 && place !== undefined && seat?.tiles.includes(place.cellIndex) === true) {
        arrived = tick;
      }
      if (taskOf(world, steward.id) === undefined) {
        finished = tick;
      }
    }
    expect(arrived).toBeGreaterThan(0);
    expect(finished - arrived).toBeGreaterThanOrEqual(
      world.engine.content.constants.stewardAudienceTicks,
    );
    const history = world.engine.tasks.getQueue(steward.id)?.history ?? [];
    expect(history.find((entry) => entry.type === audienceTaskType)?.outcome).toBe(
      TaskStatus.Completed,
    );
  });

  it("starts waiting at once when the Steward already sits in the throne room", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.throneRoom(5, 5);
    const steward = world.steward(6 * 20 + 6);
    world.engine.tasks.enqueue(steward.id, { type: audienceTaskType, data: {}, priority: 70 });
    world.run(2);
    expect(taskOf(world, steward.id)?.status).toBe(TaskStatus.Waiting);
    world.run(world.engine.content.constants.stewardAudienceTicks + 2);
    expect(taskOf(world, steward.id)).toBeUndefined();
  });

  it("ends at once without a seat of government", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    const steward = world.steward(2);
    world.engine.tasks.enqueue(steward.id, { type: audienceTaskType, data: {}, priority: 70 });
    world.run(2);
    expect(taskOf(world, steward.id)).toBeUndefined();
  });

  it("fails when the Steward cannot get to the throne room", () => {
    const world = createStandingWorld({ width: 20, height: 20 });
    world.throneRoom(5, 5);
    const steward = world.steward(15 * 20 + 15);
    for (const cell of [14 * 20 + 15, 16 * 20 + 15, 15 * 20 + 14, 15 * 20 + 16]) {
      world.spawn("wall", cell);
    }
    world.run(1);
    world.engine.tasks.enqueue(steward.id, { type: audienceTaskType, data: {}, priority: 70 });
    world.run(5);
    const history = world.engine.tasks.getQueue(steward.id)?.history ?? [];
    expect(history.find((entry) => entry.type === audienceTaskType)).toMatchObject({
      outcome: TaskStatus.Failed,
      reason: "unreachable",
    });
  });
});
