import type { EventBus, JsonValue } from "../engine/EventBus";
import type { Entity, EntityId } from "../ecs/Entity";
import type { EntityStore } from "../ecs/EntityStore";

/**
 * Task identifier: a positive safe integer from the persisted task counter, never reused.
 */
export type TaskId = number;

/**
 * Lifecycle of a task record (DECISIONS D-01). `Pending` tasks have not started (or were woken and
 * wait to resume), at most one task per entity is `Running`, `Waiting` tasks hold a serialized
 * wait condition. The last three are terminal; terminal records leave the queue for the history.
 */
export enum TaskStatus {
  Pending = "Pending",
  Running = "Running",
  Waiting = "Waiting",
  Completed = "Completed",
  Cancelled = "Cancelled",
  Failed = "Failed",
}

/**
 * The kinds of serialized wait condition. The enum value is the serialized `kind`.
 */
export enum WaitKind {
  Event = "event",
  ChildTask = "child-task",
  UntilTick = "until-tick",
  Predicate = "predicate",
}

/**
 * Whether the task may still clean up (graceful) or must stop without doing anything (ungraceful).
 */
export enum CancelCategory {
  Graceful = "graceful",
  Ungraceful = "ungraceful",
}

/**
 * Why a task is cancelled (DECISIONS D-01). The enum value is the serialized reason.
 */
export enum CancelReason {
  EntityDeleted = "entity_deleted",
  InterruptedByPriority = "interrupted_by_priority",
  PlayerCancel = "player_cancel",
  ComponentRemoved = "component_removed",
  Unreachable = "unreachable",
  ParentFinished = "parent_finished",
}

/**
 * The four results a task step can return.
 */
export enum StepKind {
  Continue = "continue",
  Wait = "wait",
  Done = "done",
  Fail = "fail",
}

/**
 * Wake when a bus event matching `pattern` is processed. When `matchKey` is not null the event
 * payload must be an object whose top-level field `matchKey` deep-equals `matchValue`.
 */
export type EventWait = {
  kind: WaitKind.Event;
  pattern: string;
  matchKey: string | null;
  matchValue: JsonValue;
};

/**
 * Wake when the task `taskId` of the same entity reaches a terminal status.
 */
export type ChildTaskWait = {
  kind: WaitKind.ChildTask;
  taskId: TaskId;
};

/**
 * Wake when the tick counter reaches `tick`.
 */
export type UntilTickWait = {
  kind: WaitKind.UntilTick;
  tick: number;
};

/**
 * Wake when the registered wait predicate `predicateId` returns true for `params`; evaluated once
 * per tick for the waiting entity (use events for anything that can be event driven).
 */
export type PredicateWait = {
  kind: WaitKind.Predicate;
  predicateId: string;
  params: JsonValue;
};

/**
 * A serialized wait condition: plain data, never a closure.
 */
export type WaitCondition = EventWait | ChildTaskWait | UntilTickWait | PredicateWait;

/**
 * Cancellation request attached to a task (spec 003 CancellationToken).
 */
export type CancelToken = {
  category: CancelCategory;
  reason: CancelReason;
};

/**
 * Why a waiting task was woken; set on the record until its next step has run. `data` is the
 * event payload, `{ taskId, outcome, reason }` for child waits, `{ tick }` for tick waits and
 * null for predicate waits.
 */
export type WakeInfo = {
  kind: WaitKind;
  data: JsonValue;
};

/**
 * One task of an entity's queue; the whole record is the resumable step state.
 */
export type TaskRecord = {
  id: TaskId;
  type: string;
  priority: number;
  status: TaskStatus;
  /**
   * Handler-defined step label, e.g. `approach` or `work`.
   */
  phase: string;
  /**
   * Handler-defined JSON working data (parameters and progress).
   */
  data: JsonValue;
  parentId: TaskId | null;
  waitFor: WaitCondition | null;
  wake: WakeInfo | null;
  createdTick: number;
  /**
   * Set when cancellation was requested; the handler's `cancel` runs at the next step boundary.
   */
  token: CancelToken | null;
};

/**
 * What remains of a finished task in the capped history.
 */
export type TaskHistoryEntry = {
  taskId: TaskId;
  type: string;
  outcome: TaskStatus;
  reason: string | null;
  tick: number;
};

/**
 * The data of the `TaskQueue` component: pending, running and waiting tasks (ascending id) plus
 * the capped history of finished ones.
 */
export type TaskQueueData = {
  tasks: TaskRecord[];
  history: TaskHistoryEntry[];
};

/**
 * Result of one task step.
 */
export type StepResult =
  | { kind: StepKind.Continue }
  | { kind: StepKind.Wait; until: WaitCondition }
  | { kind: StepKind.Done }
  | { kind: StepKind.Fail; reason: string };

/**
 * Options for {@link TaskContext.spawnChild}.
 */
export type SpawnChildOptions = {
  /**
   * Defaults to the parent's priority.
   */
  priority?: number;
};

/**
 * What a handler sees while it runs. `task` is the live record: handlers advance `task.phase` and
 * `task.data` in place, and everything they need to resume must be stored there.
 */
export type TaskContext = {
  entityId: EntityId;
  entity: Entity;
  tick: number;
  task: TaskRecord;
  store: EntityStore;
  bus: EventBus;
  /**
   * Enqueues a child task on the same entity (`parentId` = this task) and returns its id; pair it
   * with a `ChildTask` wait. Cancelling the parent cancels the child.
   */
  spawnChild: (type: string, data: JsonValue, options?: SpawnChildOptions) => TaskId;
};

/**
 * A resumable step machine for one task type (DECISIONS D-01). `start` runs the first step,
 * `step` every later one (also after a wake); both return what the task does next. `cancel` rolls
 * back side effects; for an ungraceful token it must not do anything slow or visible.
 */
export type TaskHandler = {
  type: string;
  /**
   * Component names the entity must keep while the task is alive; losing one fails the task
   * with reason `component_removed`.
   */
  requires?: string[];
  start: (context: TaskContext, data: JsonValue) => StepResult;
  step: (context: TaskContext, record: TaskRecord) => StepResult;
  cancel: (context: TaskContext, record: TaskRecord, token: CancelToken) => void;
};
