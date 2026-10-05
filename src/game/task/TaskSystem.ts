import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { EntityStore } from "../ecs/EntityStore";
import { cloneJson, isJsonObject, jsonEquals } from "../ecs/jsonData";
import { eventNameMatches, isValidEventPattern } from "../engine/EventBus";
import type { EventBus, JsonValue } from "../engine/EventBus";
import { CounterName } from "../engine/IdCounters";
import type { IdCounters } from "../engine/IdCounters";
import { TickSlot } from "../engine/TickPipeline";
import type { TickPipeline } from "../engine/TickPipeline";
import type { GameTime } from "../time/GameTime";
import { TaskError, TaskErrorKind } from "./TaskError";
import type { TaskHandlerRegistry } from "./TaskHandlerRegistry";
import { taskHistoryCapacity, taskQueueComponent } from "./taskQueueComponent";
import { CancelCategory, CancelReason, StepKind, TaskStatus, WaitKind } from "./taskTypes";
import type {
  CancelToken,
  StepResult,
  TaskContext,
  TaskId,
  TaskQueueData,
  TaskRecord,
  WaitCondition,
  WakeInfo,
} from "./taskTypes";
import type { WaitPredicateRegistry } from "./WaitPredicateRegistry";

/**
 * Everything a {@link TaskSystem} needs; all instances are owned by one engine.
 */
export type TaskSystemOptions = {
  store: EntityStore;
  bus: EventBus;
  counters: IdCounters;
  time: GameTime;
  handlers: TaskHandlerRegistry;
  /**
   * Needed only when tasks use `Predicate` waits.
   */
  predicates?: WaitPredicateRegistry;
};

/**
 * A task to put on an entity's queue.
 */
export type TaskRequest = {
  type: string;
  data?: JsonValue;
  /**
   * Higher runs first; default 0.
   */
  priority?: number;
  /**
   * Id of an existing task of the same entity that this one is a child of.
   */
  parentId?: TaskId | null;
};

/**
 * The default token of {@link TaskSystem.interrupt} and {@link TaskSystem.cancel}.
 */
export const playerCancelToken: CancelToken = {
  category: CancelCategory.Graceful,
  reason: CancelReason.PlayerCancel,
};

const priorityInterruptToken: CancelToken = {
  category: CancelCategory.Graceful,
  reason: CancelReason.InterruptedByPriority,
};

const parentFinishedToken: CancelToken = {
  category: CancelCategory.Graceful,
  reason: CancelReason.ParentFinished,
};

const entityDeletedToken: CancelToken = {
  category: CancelCategory.Ungraceful,
  reason: CancelReason.EntityDeleted,
};

const componentRemovedReason = "component_removed";
const taskExecutionSystemId = "task.execution";

function hasStarted(task: TaskRecord): boolean {
  return task.status !== TaskStatus.Pending || task.wake !== null;
}

/**
 * Runs the task queues of all entities (spec 003 part B, DECISIONS D-01). Each tick, at pipeline
 * slot 6, every entity with a `TaskQueue` component, in ascending entity id, finishes pending
 * cancellations, wakes tasks whose tick or predicate wait is over, picks its running task (or the
 * highest priority pending one: priority descending, id ascending) and runs exactly one step of it.
 *
 * Priority semantics: a task that arrives (enqueue, wake or priority raise of a pending task)
 * with a strictly higher priority than the running task flags the running task for
 * `interrupted_by_priority`; the flagged task and its children are cancelled gracefully at the
 * start of the entity's next slot-6 turn, and the arrival can start in that same turn. Changing
 * the priority of the running task never interrupts it. All state lives in the entities'
 * `TaskQueue` components, so a save taken between ticks resumes exactly.
 */
export class TaskSystem {
  private readonly eventWaiters = new Set<EntityId>();

  /**
   * Creates the system, subscribes it once to the bus (`**`, for event waits) and hooks entity
   * deletion so that deleted entities cancel their tasks ungracefully.
   *
   * @param options - Store, bus, counters, clock and registries of the owning engine.
   */
  constructor(private readonly options: TaskSystemOptions) {
    options.bus.subscribe("**", (payload, event) => {
      this.onEvent(event.name, payload);
    });
    options.store.addBeforeDeleteHook((entity) => {
      this.cancelOnDelete(entity);
      return null;
    });
  }

  /**
   * Registers the execution step at the pipeline slot DECISIONS section 2 names (slot 6).
   *
   * @param pipeline - The engine's tick pipeline.
   */
  registerWith(pipeline: TickPipeline): void {
    pipeline.registerSystem({
      id: taskExecutionSystemId,
      slot: TickSlot.TaskExecution,
      order: 0,
      run: (context) => {
        this.runTick(context.tick);
      },
    });
  }

  /**
   * Rebuilds the in-memory index of entities waiting for events. Call it after the entity store
   * has been restored from a save (subscriptions and indexes are never serialized).
   */
  rebuildWaitIndex(): void {
    this.eventWaiters.clear();
    for (const entity of this.options.store.entities({ includePendingDelete: true })) {
      const queue = getComponent(entity, taskQueueComponent);
      if (queue?.tasks.some((task) => task.waitFor?.kind === WaitKind.Event)) {
        this.eventWaiters.add(entity.id);
      }
    }
  }

  /**
   * Puts a task on an entity's queue.
   *
   * @param entityId - Owner entity; it needs a `TaskQueue` component.
   * @param request - Task type, data, priority and optional parent.
   * @returns The new task's id (from the persisted task counter).
   */
  enqueue(entityId: EntityId, request: TaskRequest): TaskId {
    const entity = this.options.store.require(entityId);
    const queue = this.requireQueue(entity);
    this.options.handlers.require(request.type);
    const parentId = request.parentId ?? null;
    if (parentId !== null && !queue.tasks.some((task) => task.id === parentId)) {
      throw new TaskError(
        TaskErrorKind.UnknownTask,
        `entity ${entityId} has no task ${parentId} to use as parent`,
      );
    }
    const record: TaskRecord = {
      id: this.options.counters.allocate(CounterName.TaskId),
      type: request.type,
      priority: request.priority ?? 0,
      status: TaskStatus.Pending,
      phase: "",
      data: cloneJson(request.data ?? null),
      parentId,
      waitFor: null,
      wake: null,
      createdTick: this.options.time.tickCount,
      token: null,
    };
    if (!Number.isSafeInteger(record.priority)) {
      throw new TaskError(TaskErrorKind.InvalidDefinition, "task priority must be an integer");
    }
    queue.tasks.push(record);
    this.noteArrival(queue, record);
    return record.id;
  }

  /**
   * Requests cancellation of a task and its descendants. The handlers' `cancel` runs and the
   * tasks leave the queue at the entity's next slot-6 turn. Cancelling a task that has not
   * started simply removes it (dequeue).
   *
   * @param entityId - Owner entity.
   * @param taskId - Task to cancel.
   * @param token - Cancellation category and reason; defaults to graceful `player_cancel`.
   */
  cancel(entityId: EntityId, taskId: TaskId, token: CancelToken = playerCancelToken): void {
    const queue = this.requireQueue(this.options.store.require(entityId));
    const task = queue.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new TaskError(
        TaskErrorKind.UnknownTask,
        `entity ${entityId} has no live task ${taskId}`,
      );
    }
    this.flag(queue, task, token);
  }

  /**
   * Cancels the running task and clears everything pending or waiting (spec 003 US3 scenario 2).
   * Like {@link TaskSystem.cancel} the work happens at the next slot-6 turn, so the entity is in a
   * clean state within one tick; tasks enqueued afterwards are not affected.
   *
   * @param entityId - Owner entity.
   * @param token - Cancellation category and reason; defaults to graceful `player_cancel`.
   */
  interrupt(entityId: EntityId, token: CancelToken = playerCancelToken): void {
    const queue = this.requireQueue(this.options.store.require(entityId));
    for (const task of queue.tasks) {
      this.flag(queue, task, token);
    }
  }

  /**
   * Changes a task's priority. Raising a pending task above the running one interrupts the
   * running task like a new arrival would; changing the running task's own priority never does.
   *
   * @param entityId - Owner entity.
   * @param taskId - Task to change.
   * @param priority - New integer priority.
   */
  setPriority(entityId: EntityId, taskId: TaskId, priority: number): void {
    if (!Number.isSafeInteger(priority)) {
      throw new TaskError(TaskErrorKind.InvalidDefinition, "task priority must be an integer");
    }
    const queue = this.requireQueue(this.options.store.require(entityId));
    const task = queue.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new TaskError(
        TaskErrorKind.UnknownTask,
        `entity ${entityId} has no live task ${taskId}`,
      );
    }
    task.priority = priority;
    if (task.status === TaskStatus.Pending) {
      this.noteArrival(queue, task);
    }
  }

  /**
   * Reads an entity's task queue.
   *
   * @param entityId - Entity to inspect.
   * @returns The live queue data, or undefined when the entity has no `TaskQueue`.
   */
  getQueue(entityId: EntityId): TaskQueueData | undefined {
    const entity = this.options.store.get(entityId);
    return entity ? getComponent(entity, taskQueueComponent) : undefined;
  }

  /**
   * Reads the running task of an entity.
   *
   * @param entityId - Entity to inspect.
   * @returns The `Running` record, or undefined when none runs.
   */
  getRunningTask(entityId: EntityId): TaskRecord | undefined {
    return this.getQueue(entityId)?.tasks.find((task) => task.status === TaskStatus.Running);
  }

  /**
   * Runs one scheduling turn for every entity with a task queue, in ascending entity id.
   *
   * @param tick - The tick being processed.
   */
  runTick(tick: number): void {
    for (const entity of this.options.store.entities()) {
      const queue = getComponent(entity, taskQueueComponent);
      if (queue && queue.tasks.length > 0) {
        this.runEntity(entity, queue, tick);
      }
    }
  }

  private runEntity(entity: Entity, queue: TaskQueueData, tick: number): void {
    this.finishCancelled(entity, queue, tick);
    this.wakeTimedWaits(entity, queue, tick);
    const task = this.selectTask(queue);
    if (!task) {
      return;
    }
    const handler = this.options.handlers.require(task.type);
    const missing = handler.requires?.find((name) => !Object.hasOwn(entity.components, name));
    if (missing !== undefined) {
      this.finalize(entity, queue, task, TaskStatus.Failed, componentRemovedReason, tick);
      return;
    }
    const context = this.createContext(entity, task, tick);
    const fresh = task.status === TaskStatus.Pending && task.wake === null;
    task.status = TaskStatus.Running;
    task.waitFor = null;
    const result = fresh ? handler.start(context, task.data) : handler.step(context, task);
    task.wake = null;
    this.applyResult(entity, queue, task, result, tick);
  }

  private selectTask(queue: TaskQueueData): TaskRecord | undefined {
    const running = queue.tasks.find((task) => task.status === TaskStatus.Running);
    if (running) {
      return running;
    }
    let best: TaskRecord | undefined;
    for (const task of queue.tasks) {
      if (task.status === TaskStatus.Pending && (!best || task.priority > best.priority)) {
        best = task;
      }
    }
    return best;
  }

  private createContext(entity: Entity, task: TaskRecord, tick: number): TaskContext {
    return {
      entityId: entity.id,
      entity,
      tick,
      task,
      store: this.options.store,
      bus: this.options.bus,
      spawnChild: (type, data, options) =>
        this.enqueue(entity.id, {
          type,
          data,
          priority: options?.priority ?? task.priority,
          parentId: task.id,
        }),
    };
  }

  private applyResult(
    entity: Entity,
    queue: TaskQueueData,
    task: TaskRecord,
    result: StepResult,
    tick: number,
  ): void {
    switch (result.kind) {
      case StepKind.Continue:
        task.status = TaskStatus.Running;
        return;
      case StepKind.Wait:
        this.enterWait(entity, queue, task, result.until);
        return;
      case StepKind.Done:
        this.finalize(entity, queue, task, TaskStatus.Completed, null, tick);
        return;
      case StepKind.Fail:
        this.finalize(entity, queue, task, TaskStatus.Failed, result.reason, tick);
        return;
    }
  }

  private enterWait(
    entity: Entity,
    queue: TaskQueueData,
    task: TaskRecord,
    until: WaitCondition,
  ): void {
    const condition = this.validateWait(queue, task, until);
    task.waitFor = condition;
    if (condition.kind === WaitKind.ChildTask) {
      const target = queue.tasks.find((candidate) => candidate.id === condition.taskId);
      if (!target) {
        const past = queue.history.find((entry) => entry.taskId === condition.taskId);
        this.wake(queue, task, {
          kind: WaitKind.ChildTask,
          data: {
            taskId: condition.taskId,
            outcome: past?.outcome ?? null,
            reason: past?.reason ?? null,
          },
        });
        return;
      }
    }
    task.status = TaskStatus.Waiting;
    if (condition.kind === WaitKind.Event) {
      this.eventWaiters.add(entity.id);
    }
  }

  private validateWait(
    queue: TaskQueueData,
    task: TaskRecord,
    until: WaitCondition,
  ): WaitCondition {
    switch (until.kind) {
      case WaitKind.Event:
        if (!isValidEventPattern(until.pattern)) {
          throw new TaskError(
            TaskErrorKind.InvalidWait,
            `task ${task.id}: invalid event pattern "${until.pattern}"`,
          );
        }
        if (until.matchKey === null && until.matchValue !== null) {
          throw new TaskError(
            TaskErrorKind.InvalidWait,
            `task ${task.id}: matchValue requires a matchKey`,
          );
        }
        return { ...until, matchValue: cloneJson(until.matchValue) };
      case WaitKind.ChildTask:
        if (until.taskId === task.id) {
          throw new TaskError(TaskErrorKind.InvalidWait, `task ${task.id} cannot wait for itself`);
        }
        return { ...until };
      case WaitKind.UntilTick:
        if (!Number.isSafeInteger(until.tick) || until.tick < 0) {
          throw new TaskError(
            TaskErrorKind.InvalidWait,
            `task ${task.id}: wait tick must be a non-negative integer`,
          );
        }
        return { ...until };
      case WaitKind.Predicate:
        if (!this.options.predicates?.has(until.predicateId)) {
          throw new TaskError(
            TaskErrorKind.InvalidWait,
            `task ${task.id}: wait predicate "${until.predicateId}" is not registered`,
          );
        }
        return { ...until, params: cloneJson(until.params) };
    }
  }

  private wake(queue: TaskQueueData, task: TaskRecord, info: WakeInfo): void {
    task.status = TaskStatus.Pending;
    task.waitFor = null;
    task.wake = info;
    this.noteArrival(queue, task);
  }

  private wakeTimedWaits(entity: Entity, queue: TaskQueueData, tick: number): void {
    for (const task of [...queue.tasks]) {
      const condition = task.waitFor;
      if (task.status !== TaskStatus.Waiting || task.token !== null || condition === null) {
        continue;
      }
      if (condition.kind === WaitKind.UntilTick && condition.tick <= tick) {
        this.wake(queue, task, { kind: WaitKind.UntilTick, data: { tick } });
      } else if (
        condition.kind === WaitKind.Predicate &&
        this.options.predicates?.evaluate(
          condition.predicateId,
          { entityId: entity.id, tick, store: this.options.store },
          condition.params,
        ) === true
      ) {
        this.wake(queue, task, { kind: WaitKind.Predicate, data: null });
      }
    }
  }

  private onEvent(name: string, payload: JsonValue): void {
    for (const entityId of [...this.eventWaiters].sort((left, right) => left - right)) {
      const entity = this.options.store.get(entityId);
      const queue = entity ? getComponent(entity, taskQueueComponent) : undefined;
      if (!queue) {
        this.eventWaiters.delete(entityId);
        continue;
      }
      let remaining = false;
      for (const task of queue.tasks) {
        const condition = task.waitFor;
        if (task.status !== TaskStatus.Waiting || condition?.kind !== WaitKind.Event) {
          continue;
        }
        if (task.token === null && this.eventMatches(condition, name, payload)) {
          this.wake(queue, task, { kind: WaitKind.Event, data: cloneJson(payload) });
        } else {
          remaining = true;
        }
      }
      if (!remaining) {
        this.eventWaiters.delete(entityId);
      }
    }
  }

  private eventMatches(
    condition: Extract<WaitCondition, { kind: WaitKind.Event }>,
    name: string,
    payload: JsonValue,
  ): boolean {
    if (!eventNameMatches(condition.pattern, name)) {
      return false;
    }
    if (condition.matchKey === null) {
      return true;
    }
    return (
      isJsonObject(payload) &&
      Object.hasOwn(payload, condition.matchKey) &&
      jsonEquals(payload[condition.matchKey], condition.matchValue)
    );
  }

  // An arriving runnable task with a strictly higher priority flags the running task, unless the
  // running task is its ancestor (a parent never interrupts itself by spawning children).
  private noteArrival(queue: TaskQueueData, arrival: TaskRecord): void {
    const running = queue.tasks.find(
      (task) => task.status === TaskStatus.Running && task.token === null,
    );
    if (
      running &&
      arrival.token === null &&
      arrival.priority > running.priority &&
      !this.descendantIds(queue, running.id).has(arrival.id)
    ) {
      this.flag(queue, running, priorityInterruptToken);
    }
  }

  private descendantIds(queue: TaskQueueData, rootId: TaskId): Set<TaskId> {
    const found = new Set<TaskId>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const task of queue.tasks) {
        if (
          task.parentId !== null &&
          (task.parentId === rootId || found.has(task.parentId)) &&
          !found.has(task.id)
        ) {
          found.add(task.id);
          grew = true;
        }
      }
    }
    return found;
  }

  private flag(queue: TaskQueueData, root: TaskRecord, token: CancelToken): void {
    const family = this.descendantIds(queue, root.id);
    for (const task of queue.tasks) {
      if ((task.id === root.id || family.has(task.id)) && task.token === null) {
        task.token = { ...token };
      }
    }
  }

  private finishCancelled(entity: Entity, queue: TaskQueueData, tick: number): void {
    const flagged = queue.tasks
      .filter((task) => task.token !== null)
      .sort((left, right) => right.id - left.id);
    for (const task of flagged) {
      const token = task.token as CancelToken;
      if (hasStarted(task)) {
        this.options.handlers
          .require(task.type)
          .cancel(this.createContext(entity, task, tick), task, token);
      }
      this.finalize(entity, queue, task, TaskStatus.Cancelled, token.reason, tick);
    }
  }

  private finalize(
    entity: Entity,
    queue: TaskQueueData,
    task: TaskRecord,
    outcome: TaskStatus.Completed | TaskStatus.Cancelled | TaskStatus.Failed,
    reason: string | null,
    tick: number,
  ): void {
    queue.tasks.splice(queue.tasks.indexOf(task), 1);
    queue.history.push({ taskId: task.id, type: task.type, outcome, reason, tick });
    if (queue.history.length > taskHistoryCapacity) {
      queue.history.splice(0, queue.history.length - taskHistoryCapacity);
    }
    this.options.bus.emit("task.finished", {
      entityId: entity.id,
      taskId: task.id,
      taskType: task.type,
      outcome,
      reason,
    });
    for (const orphan of queue.tasks) {
      if (orphan.parentId === task.id) {
        this.flag(queue, orphan, parentFinishedToken);
      }
    }
    for (const waiter of queue.tasks) {
      if (
        waiter.status === TaskStatus.Waiting &&
        waiter.token === null &&
        waiter.waitFor?.kind === WaitKind.ChildTask &&
        waiter.waitFor.taskId === task.id
      ) {
        this.wake(queue, waiter, {
          kind: WaitKind.ChildTask,
          data: { taskId: task.id, outcome, reason },
        });
      }
    }
  }

  private cancelOnDelete(entity: Entity): void {
    const queue = getComponent(entity, taskQueueComponent);
    this.eventWaiters.delete(entity.id);
    if (!queue) {
      return;
    }
    const tasks = [...queue.tasks].sort((left, right) => right.id - left.id);
    const tick = this.options.time.tickCount;
    for (const task of tasks) {
      task.token = { ...entityDeletedToken };
      if (hasStarted(task)) {
        this.options.handlers
          .require(task.type)
          .cancel(this.createContext(entity, task, tick), task, entityDeletedToken);
      }
      this.options.bus.emit("task.finished", {
        entityId: entity.id,
        taskId: task.id,
        taskType: task.type,
        outcome: TaskStatus.Cancelled,
        reason: CancelReason.EntityDeleted,
      });
    }
    queue.tasks = [];
  }

  private requireQueue(entity: Entity): TaskQueueData {
    const queue = getComponent(entity, taskQueueComponent);
    if (!queue) {
      throw new TaskError(
        TaskErrorKind.NoTaskQueue,
        `entity ${entity.id} has no TaskQueue component`,
      );
    }
    return queue;
  }
}
