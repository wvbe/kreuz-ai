import { describe, expect, it } from "vitest";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import { EcsErrorKind } from "../ecs/EcsError";
import { taskHistoryCapacity, taskQueueComponent } from "./taskQueueComponent";
import { CancelCategory, CancelReason, TaskStatus, WaitKind } from "./taskTypes";
import type { TaskQueueData, TaskRecord } from "./taskTypes";

function record(id: number, overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    type: "work.count",
    priority: 0,
    status: TaskStatus.Pending,
    phase: "",
    data: { total: 3 },
    parentId: null,
    waitFor: null,
    wake: null,
    createdTick: 0,
    token: null,
    ...overrides,
  };
}

function registry(): ComponentRegistry {
  const components = new ComponentRegistry();
  components.register(taskQueueComponent);
  return components;
}

describe("taskQueueComponent", () => {
  it("has empty defaults and a capped history", () => {
    expect(taskQueueComponent.defaults()).toEqual({ tasks: [], history: [] });
    expect(taskHistoryCapacity).toBe(8);
  });

  it("round-trips every task state through JSON", () => {
    const queue: TaskQueueData = {
      tasks: [
        record(1, { status: TaskStatus.Running, phase: "work" }),
        record(2, {
          status: TaskStatus.Waiting,
          waitFor: { kind: WaitKind.Event, pattern: "a.*", matchKey: "id", matchValue: 3 },
          parentId: 1,
        }),
        record(3, {
          status: TaskStatus.Waiting,
          waitFor: { kind: WaitKind.ChildTask, taskId: 4 },
          token: { category: CancelCategory.Graceful, reason: CancelReason.PlayerCancel },
        }),
        record(5, { wake: { kind: WaitKind.UntilTick, data: { tick: 9 } } }),
        record(6, {
          status: TaskStatus.Waiting,
          waitFor: { kind: WaitKind.Predicate, predicateId: "x.y", params: [1] },
        }),
        record(7, { status: TaskStatus.Waiting, waitFor: { kind: WaitKind.UntilTick, tick: 12 } }),
      ],
      history: [
        { taskId: 9, type: "map.travel", outcome: TaskStatus.Failed, reason: "x", tick: 4 },
      ],
    };
    const loaded = registry().validate("TaskQueue", JSON.parse(JSON.stringify(queue)));
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(queue));
  });

  it("rejects corrupt queues", () => {
    const components = registry();
    const bad = (data: object): void => {
      expect(() => components.validate("TaskQueue", JSON.parse(JSON.stringify(data)))).toThrow(
        expect.objectContaining({ kind: EcsErrorKind.InvalidComponentData }),
      );
    };
    bad({ tasks: [record(2), record(1)], history: [] });
    bad({
      tasks: [record(1, { status: TaskStatus.Running }), record(2, { status: TaskStatus.Running })],
      history: [],
    });
    bad({ tasks: [record(1, { status: TaskStatus.Waiting })], history: [] });
    bad({ tasks: [record(1, { waitFor: { kind: WaitKind.UntilTick, tick: 1 } })], history: [] });
    bad({ tasks: [record(1, { status: TaskStatus.Completed })], history: [] });
    bad({ tasks: [{ ...record(1), extra: 1 }], history: [] });
    bad({ tasks: [record(1, { priority: 1.5 })], history: [] });
    bad({
      tasks: [],
      history: Array.from({ length: taskHistoryCapacity + 1 }, (_, index) => ({
        taskId: index + 1,
        type: "a",
        outcome: TaskStatus.Completed,
        reason: null,
        tick: 0,
      })),
    });
  });
});
