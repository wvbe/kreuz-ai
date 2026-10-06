import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ComponentRegistry, defineComponent } from "../ecs/ComponentRegistry";
import { EntityStore } from "../ecs/EntityStore";
import { isJsonObject } from "../ecs/jsonData";
import { PrototypeRegistry } from "../ecs/PrototypeRegistry";
import { EventBus } from "../engine/EventBus";
import type { JsonValue } from "../engine/EventBus";
import { IdCounters } from "../engine/IdCounters";
import { TickPipeline, TickSlot } from "../engine/TickPipeline";
import { GameTime } from "../time/GameTime";
import {
  childWait,
  continueStep,
  doneStep,
  eventWait,
  failStep,
  predicateWait,
  tickWait,
  waitStep,
} from "./stepResults";
import { TaskError, TaskErrorKind } from "./TaskError";
import { TaskHandlerRegistry } from "./TaskHandlerRegistry";
import { playerCancelToken, TaskSystem } from "./TaskSystem";
import { taskHistoryCapacity, taskQueueComponent } from "./taskQueueComponent";
import { CancelCategory, CancelReason, TaskStatus, WaitKind } from "./taskTypes";
import type { StepResult, TaskContext, TaskRecord } from "./taskTypes";
import { WaitPredicateRegistry } from "./WaitPredicateRegistry";

const toolComponent = defineComponent("Tool", z.object({}).strict(), () => ({}));

function dataOf(value: JsonValue): { [key: string]: JsonValue } {
  if (!isJsonObject(value)) {
    throw new Error("task data is not an object");
  }
  return value;
}

type World = ReturnType<typeof createWorld>;

function createWorld() {
  const bus = new EventBus();
  const time = new GameTime(bus);
  const counters = new IdCounters();
  const components = new ComponentRegistry();
  components.register(taskQueueComponent);
  components.register(toolComponent);
  const prototypes = new PrototypeRegistry(components);
  prototypes.register({ id: "worker", components: { TaskQueue: {} } });
  prototypes.register({ id: "tooled", components: { TaskQueue: {}, Tool: {} } });
  prototypes.register({ id: "rock", components: { Tool: {} } });
  const store = new EntityStore({ components, prototypes, counters, bus });
  const handlers = new TaskHandlerRegistry();
  const predicates = new WaitPredicateRegistry();
  const tasks = new TaskSystem({ store, bus, counters, time, handlers, predicates });
  const pipeline = new TickPipeline({ time, bus });
  tasks.registerWith(pipeline);
  const log: string[] = [];
  const finished: JsonValue[] = [];
  bus.subscribe("task.finished", (payload) => {
    finished.push(payload);
  });
  const world = {
    bus,
    time,
    counters,
    components,
    prototypes,
    store,
    handlers,
    predicates,
    tasks,
    pipeline,
    log,
    finished,
  };
  registerHandlers(handlers, predicates, log);
  return world;
}

function registerHandlers(
  handlers: TaskHandlerRegistry,
  predicates: WaitPredicateRegistry,
  log: string[],
): void {
  const counting = (context: TaskContext, label: string): StepResult => {
    const data = dataOf(context.task.data);
    const done = Number(data["done"] ?? 0) + 1;
    data["done"] = done;
    log.push(`${label}#${context.task.id}:${done}`);
    return done >= Number(data["total"]) ? doneStep() : continueStep();
  };
  handlers.register({
    type: "work.count",
    start: (context, data) => {
      const copy = dataOf(data);
      copy["done"] = 0;
      context.task.phase = "work";
      log.push(`start#${context.task.id}`);
      return counting(context, "step");
    },
    step: (context) => counting(context, "step"),
    cancel: (context, record, token) => {
      log.push(`cancel#${record.id}:${token.category}:${token.reason}`);
    },
  });
  handlers.register({
    type: "work.sleep",
    start: (context, data) => {
      context.task.phase = "sleeping";
      return waitStep(tickWait(Number(dataOf(data)["until"])));
    },
    step: (context) => {
      log.push(`woke#${context.task.id}@${context.tick}`);
      return doneStep();
    },
    cancel: (_context, record) => {
      log.push(`cancel#${record.id}`);
    },
  });
  handlers.register({
    type: "work.listen",
    start: (context, data) => {
      context.task.phase = "listening";
      const wait = dataOf(data);
      return waitStep(
        wait["key"] === undefined
          ? eventWait(String(wait["pattern"]))
          : eventWait(String(wait["pattern"]), {
              key: String(wait["key"]),
              value: wait["value"] ?? null,
            }),
      );
    },
    step: (context) => {
      log.push(`heard#${context.task.id}:${JSON.stringify(context.task.wake?.data)}`);
      return doneStep();
    },
    cancel: (_context, record) => {
      log.push(`cancel#${record.id}`);
    },
  });
  handlers.register({
    type: "work.guard",
    start: (context) => {
      context.task.phase = "guarding";
      return waitStep(predicateWait("flag.raised", "go"));
    },
    step: (context) => {
      log.push(`guard-woke#${context.task.id}`);
      return doneStep();
    },
    cancel: () => undefined,
  });
  predicates.register(
    "flag.raised",
    (_context, params) => params === "go" && log.includes("raise"),
  );
  handlers.register({
    type: "work.fail",
    start: () => failStep("nope"),
    step: () => failStep("nope"),
    cancel: () => undefined,
  });
  handlers.register({
    type: "work.tooled",
    requires: ["Tool"],
    start: (context) => {
      context.task.phase = "using";
      return continueStep();
    },
    step: () => continueStep(),
    cancel: (_context, record) => {
      log.push(`cancel-tooled#${record.id}`);
    },
  });
  // A parent that runs two children one after the other: phase advances as they finish.
  handlers.register({
    type: "work.chain",
    start: (context, data) => {
      context.task.phase = "first";
      const child = context.spawnChild(String(dataOf(data)["child"]), { total: 2 });
      context.task.data = { ...dataOf(data), current: child };
      return waitStep(childWait(child));
    },
    step: (context) => {
      const data = dataOf(context.task.data);
      const woke = dataOf(context.task.wake?.data ?? null);
      log.push(`chain#${context.task.id}:${context.task.phase}:${String(woke["outcome"])}`);
      if (woke["outcome"] !== TaskStatus.Completed) {
        return failStep("child_failed");
      }
      if (context.task.phase === "first") {
        context.task.phase = "second";
        const child = context.spawnChild("work.count", { total: 1 });
        data["current"] = child;
        return waitStep(childWait(child));
      }
      return doneStep();
    },
    cancel: (_context, record) => {
      log.push(`cancel-chain#${record.id}`);
    },
  });
}

function spawnWorker(world: World): number {
  return world.store.spawn("worker").id;
}

function run(world: World, ticks: number): void {
  world.pipeline.runTicks(ticks);
}

function queueOf(
  world: World,
  entityId: number,
): { tasks: TaskRecord[]; history: { outcome: string; reason: string | null; taskId: number }[] } {
  const queue = world.tasks.getQueue(entityId);
  if (!queue) {
    throw new Error("no queue");
  }
  return queue;
}

describe("TaskSystem registration", () => {
  it("registers at the task execution slot of the pipeline", () => {
    const world = createWorld();
    expect(world.pipeline.getSystemOrder()).toEqual([
      { id: "task.execution", slot: TickSlot.TaskExecution, order: 0 },
    ]);
  });
});

describe("TaskSystem.enqueue and priority order", () => {
  // @covers 003:FR-006
  // @covers 003:FR-007
  // @covers 003:SC-004
  it("executes tasks highest priority first: [1, 10, 5] runs as [10, 5, 1] (US3.1)", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const low = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 1 },
      priority: 1,
    });
    const high = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 1 },
      priority: 10,
    });
    const middle = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 1 },
      priority: 5,
    });
    run(world, 3);
    expect(world.log.filter((entry) => entry.startsWith("start#"))).toEqual([
      `start#${high}`,
      `start#${middle}`,
      `start#${low}`,
    ]);
    expect(queueOf(world, worker).tasks).toEqual([]);
  });

  // @covers 003:FR-007
  // @covers 003:SC-004
  it("breaks priority ties by ascending task id and runs one step per tick per entity", () => {
    const world = createWorld();
    const first = spawnWorker(world);
    const second = spawnWorker(world);
    const firstTask = world.tasks.enqueue(first, { type: "work.count", data: { total: 2 } });
    const secondTask = world.tasks.enqueue(first, { type: "work.count", data: { total: 1 } });
    const other = world.tasks.enqueue(second, { type: "work.count", data: { total: 1 } });
    run(world, 1);
    expect(world.log).toEqual([
      `start#${firstTask}`,
      `step#${firstTask}:1`,
      `start#${other}`,
      `step#${other}:1`,
    ]);
    run(world, 1);
    expect(world.log.slice(4)).toEqual([`step#${firstTask}:2`]);
    run(world, 1);
    expect(world.log.slice(5)).toEqual([`start#${secondTask}`, `step#${secondTask}:1`]);
  });

  it("allocates ids from the persisted task counter and rejects bad input", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const first = world.tasks.enqueue(worker, { type: "work.count", data: { total: 1 } });
    const second = world.tasks.enqueue(worker, { type: "work.count", data: { total: 1 } });
    expect(second).toBe(first + 1);
    expect(world.counters.serialize().nextTaskId).toBe(second + 1);
    expect(() => world.tasks.enqueue(worker, { type: "work.unknown" })).toThrow(TaskError);
    const rock = world.store.spawn("rock").id;
    expect(() => world.tasks.enqueue(rock, { type: "work.count" })).toThrow(
      expect.objectContaining({ kind: TaskErrorKind.NoTaskQueue }),
    );
    expect(() => world.tasks.enqueue(worker, { type: "work.count", parentId: 999 })).toThrow(
      expect.objectContaining({ kind: TaskErrorKind.UnknownTask }),
    );
    expect(() => world.tasks.enqueue(worker, { type: "work.count", priority: 1.5 })).toThrow(
      TaskError,
    );
  });
});

describe("TaskSystem interrupt, cancel and priority matrix", () => {
  // @covers 003:FR-008
  // @covers 003:SC-005
  it("interrupt cancels the running task gracefully and clears the queue within one tick (US3.2)", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const running = world.tasks.enqueue(worker, { type: "work.count", data: { total: 5 } });
    const pending = world.tasks.enqueue(worker, { type: "work.count", data: { total: 5 } });
    run(world, 2);
    expect(world.tasks.getRunningTask(worker)?.id).toBe(running);
    world.tasks.interrupt(worker);
    run(world, 1);
    expect(queueOf(world, worker).tasks).toEqual([]);
    expect(world.log).toContain(`cancel#${running}:graceful:player_cancel`);
    expect(world.log.some((entry) => entry.startsWith(`cancel#${pending}`))).toBe(false);
    expect(
      queueOf(world, worker).history.map((entry) => [entry.taskId, entry.outcome, entry.reason]),
    ).toEqual([
      [pending, "Cancelled", "player_cancel"],
      [running, "Cancelled", "player_cancel"],
    ]);
  });

  it("tasks enqueued after an interrupt are not affected", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    world.tasks.enqueue(worker, { type: "work.count", data: { total: 5 } });
    run(world, 1);
    world.tasks.interrupt(worker);
    const fresh = world.tasks.enqueue(worker, { type: "work.count", data: { total: 1 } });
    run(world, 1);
    expect(world.log).toContain(`start#${fresh}`);
    expect(queueOf(world, worker).tasks).toEqual([]);
  });

  it("cancel dequeues a pending task without calling its handler", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    world.tasks.enqueue(worker, { type: "work.count", data: { total: 2 }, priority: 5 });
    const pending = world.tasks.enqueue(worker, { type: "work.count", data: { total: 2 } });
    world.tasks.cancel(worker, pending);
    run(world, 1);
    expect(world.log.some((entry) => entry.includes(`#${pending}`))).toBe(false);
    expect(queueOf(world, worker).history[0]).toMatchObject({
      taskId: pending,
      outcome: "Cancelled",
    });
    expect(() => world.tasks.cancel(worker, 999)).toThrow(
      expect.objectContaining({ kind: TaskErrorKind.UnknownTask }),
    );
  });

  it("a strictly higher priority arrival cancels the running task gracefully and starts in the same tick", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const slow = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 9 },
      priority: 1,
    });
    run(world, 2);
    const urgent = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 1 },
      priority: 2,
    });
    run(world, 1);
    expect(world.log.slice(-3)).toEqual([
      `cancel#${slow}:graceful:interrupted_by_priority`,
      `start#${urgent}`,
      `step#${urgent}:1`,
    ]);
    expect(queueOf(world, worker).tasks).toEqual([]);
  });

  it("an equal priority arrival does not interrupt", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const first = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 3 },
      priority: 4,
    });
    run(world, 1);
    world.tasks.enqueue(worker, { type: "work.count", data: { total: 1 }, priority: 4 });
    run(world, 2);
    expect(world.log.some((entry) => entry.startsWith("cancel"))).toBe(false);
    expect(queueOf(world, worker).history[0]).toMatchObject({
      taskId: first,
      outcome: "Completed",
    });
  });

  // @covers 003:FR-006
  it("reprioritizing a pending task reorders the queue without losing state (US3.3)", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const early = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 1 },
      priority: 1,
    });
    const late = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 1 },
      priority: 1,
    });
    world.tasks.setPriority(worker, late, 3);
    run(world, 2);
    expect(world.log.filter((entry) => entry.startsWith("start#"))).toEqual([
      `start#${late}`,
      `start#${early}`,
    ]);
    expect(() => world.tasks.setPriority(worker, 999, 1)).toThrow(TaskError);
    expect(() => world.tasks.setPriority(worker, late, 0.5)).toThrow(TaskError);
  });

  it("changing the priority of the running task never interrupts it", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const running = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 3 },
      priority: 5,
    });
    run(world, 1);
    const waiting = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 1 },
      priority: 4,
    });
    world.tasks.setPriority(worker, running, 0);
    run(world, 2);
    expect(world.log.some((entry) => entry.startsWith("cancel"))).toBe(false);
    expect(queueOf(world, worker).history[0]).toMatchObject({
      taskId: running,
      outcome: "Completed",
    });
    run(world, 1);
    expect(queueOf(world, worker).history[1]).toMatchObject({
      taskId: waiting,
      outcome: "Completed",
    });
  });

  it("raising a pending task above the running one interrupts like an arrival", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const running = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 9 },
      priority: 5,
    });
    const pending = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 1 },
      priority: 1,
    });
    run(world, 1);
    world.tasks.setPriority(worker, pending, 6);
    run(world, 1);
    expect(world.log).toContain(`cancel#${running}:graceful:interrupted_by_priority`);
    expect(queueOf(world, worker).tasks).toEqual([]);
  });

  // @covers 003:FR-008
  it("deleting an entity cancels its tasks ungracefully with entity_deleted", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const running = world.tasks.enqueue(worker, { type: "work.count", data: { total: 9 } });
    const pending = world.tasks.enqueue(worker, { type: "work.count", data: { total: 9 } });
    run(world, 1);
    world.store.requestDelete(worker);
    world.store.flushDeletions();
    world.bus.processQueue();
    expect(world.log).toContain(`cancel#${running}:ungraceful:entity_deleted`);
    expect(world.log.some((entry) => entry.startsWith(`cancel#${pending}`))).toBe(false);
    expect(world.finished).toEqual([
      {
        entityId: worker,
        taskId: pending,
        taskType: "work.count",
        outcome: "Cancelled",
        reason: "entity_deleted",
      },
      {
        entityId: worker,
        taskId: running,
        taskType: "work.count",
        outcome: "Cancelled",
        reason: "entity_deleted",
      },
    ]);
    expect(world.tasks.getQueue(worker)).toBeUndefined();
  });

  it("exports the default player cancel token", () => {
    expect(playerCancelToken).toEqual({
      category: CancelCategory.Graceful,
      reason: CancelReason.PlayerCancel,
    });
  });
});

describe("TaskSystem history and events", () => {
  it("keeps the last taskHistoryCapacity finished tasks and emits task.finished", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const ids: number[] = [];
    for (let index = 0; index < taskHistoryCapacity + 3; index += 1) {
      ids.push(world.tasks.enqueue(worker, { type: "work.count", data: { total: 1 } }));
    }
    run(world, taskHistoryCapacity + 3);
    const history = queueOf(world, worker).history;
    expect(history.map((entry) => entry.taskId)).toEqual(ids.slice(-taskHistoryCapacity));
    expect(world.finished).toHaveLength(taskHistoryCapacity + 3);
    expect(world.finished[0]).toEqual({
      entityId: worker,
      taskId: ids[0],
      taskType: "work.count",
      outcome: "Completed",
      reason: null,
    });
  });

  it("records Fail results as Failed with the reason", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const task = world.tasks.enqueue(worker, { type: "work.fail" });
    run(world, 1);
    expect(queueOf(world, worker).history).toEqual([
      { taskId: task, type: "work.fail", outcome: TaskStatus.Failed, reason: "nope", tick: 1 },
    ]);
  });
});

describe("TaskSystem waits", () => {
  // @covers 003:FR-009
  // @covers 003:SC-006
  it("wakes a tick wait at the requested tick and runs the resume step", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const task = world.tasks.enqueue(worker, { type: "work.sleep", data: { until: 4 } });
    run(world, 3);
    expect(queueOf(world, worker).tasks[0]).toMatchObject({ id: task, status: TaskStatus.Waiting });
    expect(world.log).toEqual([]);
    run(world, 1);
    expect(world.log).toEqual([`woke#${task}@4`]);
  });

  it("wakes an event wait with the matching payload only", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const task = world.tasks.enqueue(worker, {
      type: "work.listen",
      data: { pattern: "door.**", key: "doorId", value: 7 },
    });
    run(world, 1);
    world.bus.emit("door.opened", { doorId: 8 });
    world.bus.emit("window.opened", { doorId: 7 });
    run(world, 1);
    expect(world.log).toEqual([]);
    world.bus.emit("door.state.changed", { doorId: 7, isOpen: true });
    run(world, 1);
    expect(world.log).toEqual([`heard#${task}:{"doorId":7,"isOpen":true}`]);
  });

  it("wakes an event wait without a payload filter on any matching event", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    world.tasks.enqueue(worker, { type: "work.listen", data: { pattern: "bell.rung" } });
    run(world, 1);
    world.bus.emit("bell.rung", null);
    run(world, 2);
    expect(world.log).toHaveLength(1);
  });

  it("wakes a predicate wait when the registered predicate becomes true", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const task = world.tasks.enqueue(worker, { type: "work.guard" });
    run(world, 2);
    expect(world.log).toEqual([]);
    world.log.push("raise");
    run(world, 2);
    expect(world.log).toContain(`guard-woke#${task}`);
  });

  it("rejects unregistered predicates, negative ticks, self waits and matchValue without key", () => {
    const attempts: StepResult[] = [
      waitStep(predicateWait("missing.one")),
      waitStep(tickWait(-1)),
      waitStep(childWait(1)),
      waitStep(eventWait("Not Valid")),
      waitStep({ kind: WaitKind.Event, pattern: "a.b", matchKey: null, matchValue: 3 }),
    ];
    for (const attempt of attempts) {
      const world = createWorld();
      const worker = spawnWorker(world);
      world.handlers.register({
        type: "work.bad",
        start: () => attempt,
        step: () => doneStep(),
        cancel: () => undefined,
      });
      world.tasks.enqueue(worker, { type: "work.bad" });
      expect(() => run(world, 1)).toThrow(
        expect.objectContaining({ kind: TaskErrorKind.InvalidWait }),
      );
    }
  });
});

describe("TaskSystem child tasks", () => {
  // @covers 003:FR-012
  // @covers 003:SC-007
  // @covers 003:SC-013
  it("runs sequential children through one parent whose phase advances (US4.3 replacement)", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const parent = world.tasks.enqueue(worker, {
      type: "work.chain",
      data: { child: "work.count" },
    });
    run(world, 10);
    expect(queueOf(world, worker).tasks).toEqual([]);
    expect(world.log.filter((entry) => entry.startsWith("chain#"))).toEqual([
      `chain#${parent}:first:Completed`,
      `chain#${parent}:second:Completed`,
    ]);
    expect(queueOf(world, worker).history.map((entry) => entry.outcome)).toEqual([
      TaskStatus.Completed,
      TaskStatus.Completed,
      TaskStatus.Completed,
    ]);
  });

  it("wakes the parent with the child outcome when the child fails", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const parent = world.tasks.enqueue(worker, {
      type: "work.chain",
      data: { child: "work.fail" },
    });
    run(world, 4);
    expect(world.log).toContain(`chain#${parent}:first:Failed`);
    expect(queueOf(world, worker).history.at(-1)).toMatchObject({
      taskId: parent,
      outcome: "Failed",
      reason: "child_failed",
    });
  });

  it("cancelling a parent cancels its children first", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const parent = world.tasks.enqueue(worker, {
      type: "work.chain",
      data: { child: "work.count" },
    });
    run(world, 2);
    const child = queueOf(world, worker).tasks.find(
      (task) => task.parentId === parent,
    ) as TaskRecord;
    world.tasks.cancel(worker, parent);
    run(world, 1);
    expect(world.log.filter((entry) => entry.startsWith("cancel"))).toEqual([
      `cancel#${child.id}:graceful:player_cancel`,
      `cancel-chain#${parent}`,
    ]);
    expect(queueOf(world, worker).tasks).toEqual([]);
  });

  it("cancels orphaned children when the parent finishes first", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    world.handlers.register({
      type: "work.orphaner",
      start: (context) => {
        context.spawnChild("work.count", { total: 50 });
        return doneStep();
      },
      step: () => doneStep(),
      cancel: () => undefined,
    });
    world.tasks.enqueue(worker, { type: "work.orphaner" });
    run(world, 3);
    expect(queueOf(world, worker).tasks).toEqual([]);
    expect(queueOf(world, worker).history.map((entry) => [entry.outcome, entry.reason])).toEqual([
      ["Completed", null],
      ["Cancelled", "parent_finished"],
    ]);
  });

  it("a parent waiting on an already finished task wakes with its recorded outcome", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const done = world.tasks.enqueue(worker, {
      type: "work.count",
      data: { total: 1 },
      priority: 9,
    });
    world.handlers.register({
      type: "work.late",
      start: () => waitStep(childWait(done)),
      step: (context) => {
        world.log.push(`late:${JSON.stringify(context.task.wake?.data)}`);
        return doneStep();
      },
      cancel: () => undefined,
    });
    run(world, 1);
    world.tasks.enqueue(worker, { type: "work.late" });
    run(world, 3);
    expect(world.log).toContain(`late:{"taskId":${done},"outcome":"Completed","reason":null}`);
  });

  it("a child never interrupts its own running parent", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    world.handlers.register({
      type: "work.eager",
      start: (context) => {
        context.spawnChild("work.count", { total: 1 }, { priority: 99 });
        return continueStep();
      },
      step: (context) => {
        world.log.push(`eager-step@${context.tick}`);
        return doneStep();
      },
      cancel: () => undefined,
    });
    world.tasks.enqueue(worker, { type: "work.eager" });
    run(world, 3);
    expect(world.log.some((entry) => entry.startsWith("cancel"))).toBe(false);
  });
});

describe("TaskSystem component requirements", () => {
  // @covers 003:FR-008
  it("fails a task with component_removed instead of throwing when a required component disappears", () => {
    const world = createWorld();
    const entity = world.store.spawn("tooled").id;
    const task = world.tasks.enqueue(entity, { type: "work.tooled" });
    run(world, 2);
    world.store.removeComponent(entity, toolComponent);
    expect(() => run(world, 1)).not.toThrow();
    expect(queueOf(world, entity).history).toEqual([
      {
        taskId: task,
        type: "work.tooled",
        outcome: TaskStatus.Failed,
        reason: "component_removed",
        tick: 3,
      },
    ]);
  });
});

describe("TaskSystem.rebuildWaitIndex and getQueue", () => {
  it("returns undefined queues for unknown entities and for entities without a TaskQueue", () => {
    const world = createWorld();
    expect(world.tasks.getQueue(999)).toBeUndefined();
    expect(world.tasks.getQueue(world.store.spawn("rock").id)).toBeUndefined();
    expect(world.tasks.getRunningTask(999)).toBeUndefined();
  });

  it("finds waiting event tasks of loaded entities", () => {
    const world = createWorld();
    const worker = spawnWorker(world);
    const task = world.tasks.enqueue(worker, {
      type: "work.listen",
      data: { pattern: "bell.rung" },
    });
    run(world, 1);
    // A second system instance over the same restored entities has an empty index until rebuilt.
    const saved = JSON.parse(JSON.stringify(world.store.serialize())) as JsonValue;
    const loaded = createWorld();
    loaded.counters.restore(JSON.parse(JSON.stringify(world.counters.serialize())) as JsonValue);
    loaded.store.restore(saved);
    loaded.tasks.rebuildWaitIndex();
    loaded.bus.emit("bell.rung", null);
    loaded.bus.processQueue();
    expect(loaded.tasks.getQueue(worker)?.tasks[0]).toMatchObject({
      id: task,
      status: TaskStatus.Pending,
    });
  });
});
