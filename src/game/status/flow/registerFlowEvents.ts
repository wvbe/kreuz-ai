import { z } from "zod";
import type { GameEngine } from "../../engine/GameEngine";
import { subjectOfEntity } from "../subjectOfEntity";
import { FlowDirection, FlowSource, StatusSubjectKind } from "../statusTypes";
import type { StatusSubjectRef } from "../statusTypes";
import { recordFlow } from "./recordFlow";

const itemsSchema = z.array(
  z.object({ materialId: z.string().min(1), quantity: z.number().int().min(1) }).passthrough(),
);

const craftedSchema = z
  .object({ workstationId: z.number().int(), inputs: itemsSchema, outputs: itemsSchema })
  .passthrough();

const constructedSchema = z
  .object({ jobId: z.number().int(), consumed: itemsSchema, yield: itemsSchema })
  .passthrough();

const jobDoneSchema = z
  .object({ workerId: z.number().int(), jobTypeId: z.string(), outputs: itemsSchema })
  .passthrough();

const holderItemSchema = z
  .object({
    entityId: z.number().int(),
    materialId: z.string().min(1),
    quantity: z.number().int().min(1),
  })
  .passthrough();

const householdSchema = z
  .object({
    dwellingId: z.number().int(),
    materialId: z.string().min(1),
    quantity: z.number().int().min(1),
  })
  .passthrough();

type Item = { materialId: string; quantity: number };

function recordItems(
  engine: GameEngine,
  items: readonly Item[],
  direction: FlowDirection,
  source: FlowSource,
  subject: StatusSubjectRef | null,
): void {
  for (const item of items) {
    recordFlow(engine, {
      materialId: item.materialId,
      quantity: item.quantity,
      direction,
      source,
      subject,
    });
  }
}

/**
 * Subscribes the ledger to the events that carry production and consumption (spec 025 FR-012):
 * `production.crafting.completed` (inputs consumed, outputs produced: `Recipe`),
 * `construction.job.completed` (`consumed`: `Construction`, `yield`: `Deconstruction`),
 * `jobboard.job.completed` (`outputs` of job types that list outputs: `Gathering`), `need.item.consumed` (`NeedConsumption`),
 * `inventory.item.expired` (`Spoilage`) and `housing.goods.consumed` (`HouseholdConsumption`).
 * Handlers run in the slot-20 drain, so the day bucket is the day of the tick being processed.
 * Trade is not an event of its own yet: its task calls `recordFlow`.
 *
 * @param engine - The engine; the subscriptions live as long as it does.
 */
export function registerFlowEvents(engine: GameEngine): void {
  engine.bus.subscribe("production.crafting.completed", (payload) => {
    const parsed = craftedSchema.safeParse(payload);
    if (parsed.success) {
      const subject = { kind: StatusSubjectKind.Workstation, id: parsed.data.workstationId };
      recordItems(engine, parsed.data.inputs, FlowDirection.Consumed, FlowSource.Recipe, subject);
      recordItems(engine, parsed.data.outputs, FlowDirection.Produced, FlowSource.Recipe, subject);
    }
  });
  engine.bus.subscribe("construction.job.completed", (payload) => {
    const parsed = constructedSchema.safeParse(payload);
    if (parsed.success) {
      const subject = { kind: StatusSubjectKind.ConstructionSite, id: parsed.data.jobId };
      recordItems(
        engine,
        parsed.data.consumed,
        FlowDirection.Consumed,
        FlowSource.Construction,
        subject,
      );
      recordItems(
        engine,
        parsed.data.yield,
        FlowDirection.Produced,
        FlowSource.Deconstruction,
        subject,
      );
    }
  });
  engine.bus.subscribe("jobboard.job.completed", (payload) => {
    const parsed = jobDoneSchema.safeParse(payload);
    // Only job types that list outputs gather: hauling reports the goods it moved as outputs too,
    // crafting is counted from its own event (spec 025 FR-012: never record hauling).
    if (
      parsed.success &&
      (engine.content.jobs.find(parsed.data.jobTypeId)?.outputs.length ?? 0) > 0
    ) {
      recordItems(engine, parsed.data.outputs, FlowDirection.Produced, FlowSource.Gathering, {
        kind: StatusSubjectKind.Citizen,
        id: parsed.data.workerId,
      });
    }
  });
  engine.bus.subscribe("need.item.consumed", (payload) => {
    const parsed = holderItemSchema.safeParse(payload);
    if (parsed.success) {
      recordItems(engine, [parsed.data], FlowDirection.Consumed, FlowSource.NeedConsumption, {
        kind: StatusSubjectKind.Citizen,
        id: parsed.data.entityId,
      });
    }
  });
  engine.bus.subscribe("inventory.item.expired", (payload) => {
    const parsed = holderItemSchema.safeParse(payload);
    if (parsed.success) {
      recordItems(
        engine,
        [parsed.data],
        FlowDirection.Consumed,
        FlowSource.Spoilage,
        subjectOfEntity(engine, parsed.data.entityId),
      );
    }
  });
  engine.bus.subscribe("housing.goods.consumed", (payload) => {
    const parsed = householdSchema.safeParse(payload);
    if (parsed.success) {
      recordItems(engine, [parsed.data], FlowDirection.Consumed, FlowSource.HouseholdConsumption, {
        kind: StatusSubjectKind.Dwelling,
        id: parsed.data.dwellingId,
      });
    }
  });
}
