import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { jsonValueSchema } from "../ecs/jsonData";
import { CancelCategory, CancelReason, TaskStatus, WaitKind } from "./taskTypes";
import type { TaskQueueData } from "./taskTypes";

/**
 * Number of finished tasks an entity remembers (DECISIONS D-01 `taskHistoryCapacity`).
 */
export const taskHistoryCapacity = 8;

const waitConditionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal(WaitKind.Event),
      pattern: z.string().min(1),
      matchKey: z.string().min(1).nullable(),
      matchValue: jsonValueSchema,
    })
    .strict(),
  z.object({ kind: z.literal(WaitKind.ChildTask), taskId: z.number().int().min(1) }).strict(),
  z.object({ kind: z.literal(WaitKind.UntilTick), tick: z.number().int().min(0) }).strict(),
  z
    .object({
      kind: z.literal(WaitKind.Predicate),
      predicateId: z.string().min(1),
      params: jsonValueSchema,
    })
    .strict(),
]);

const taskRecordSchema = z
  .object({
    id: z.number().int().min(1),
    type: z.string().min(1),
    priority: z.number().int(),
    status: z.enum([TaskStatus.Pending, TaskStatus.Running, TaskStatus.Waiting]),
    phase: z.string(),
    data: jsonValueSchema,
    parentId: z.number().int().min(1).nullable(),
    waitFor: waitConditionSchema.nullable(),
    wake: z
      .object({ kind: z.enum(WaitKind), data: jsonValueSchema })
      .strict()
      .nullable(),
    createdTick: z.number().int().min(0),
    token: z
      .object({ category: z.enum(CancelCategory), reason: z.enum(CancelReason) })
      .strict()
      .nullable(),
  })
  .strict();

const taskHistorySchema = z
  .object({
    taskId: z.number().int().min(1),
    type: z.string().min(1),
    outcome: z.enum([TaskStatus.Completed, TaskStatus.Cancelled, TaskStatus.Failed]),
    reason: z.string().nullable(),
    tick: z.number().int().min(0),
  })
  .strict();

const taskQueueSchema: z.ZodType<TaskQueueData> = z
  .object({
    tasks: z.array(taskRecordSchema),
    history: z.array(taskHistorySchema).max(taskHistoryCapacity),
  })
  .strict()
  .superRefine((queue, context) => {
    let previous = 0;
    let running = 0;
    for (const task of queue.tasks) {
      if (task.id <= previous) {
        context.addIssue({ code: "custom", message: `task ids must ascend (task ${task.id})` });
      }
      previous = task.id;
      if (task.status === TaskStatus.Running) {
        running += 1;
      }
      if ((task.status === TaskStatus.Waiting) !== (task.waitFor !== null)) {
        context.addIssue({
          code: "custom",
          message: `task ${task.id}: waitFor must be set exactly while Waiting`,
        });
      }
    }
    if (running > 1) {
      context.addIssue({ code: "custom", message: "at most one task may be Running" });
    }
  });

/**
 * The `TaskQueue` component (spec 003 FR-006, DECISIONS D-01): the serialized task records and the
 * capped history of an entity. Everything a task needs to resume after a load is in here.
 */
export const taskQueueComponent = defineComponent("TaskQueue", taskQueueSchema, () => ({
  tasks: [],
  history: [],
}));
