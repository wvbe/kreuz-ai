import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { jobsSystemId } from "../jobs/jobTypes";
import { storageSystemId } from "../storage/storageTypes";
import { zonesSystemId } from "../zones/zoneTypes";
import { registerCrafting } from "./craftExecutor";
import { destroyWorkstation } from "./destroyWorkstation";
import {
  cancelCraft,
  cancelProductionOrder,
  createProductionOrder,
  setProductionOrderPaused,
  setProductionOrderPriority,
} from "./productionOrders";
import { productionOrdersComponent } from "./productionOrdersComponent";
import { postCraftJobs, postOutputHauls, sweepStaleCrafts } from "./productionPoster";
import { productionSystemId } from "./productionTypes";
import {
  buildOrderDetail,
  buildOrderViews,
  buildRecipeViews,
  buildWorkstationViews,
} from "./productionViews";

const registered = new WeakSet<GameEngine>();

const idSchema = z.number().int().min(1);

/**
 * Registers production with an engine (once per engine; the engine does it for itself, so every
 * game has it, after zones). It adds:
 * - the component `ProductionOrders` (the workstation prototypes `oven`, `grinding_mill`,
 *   `sawmill` and `workbench` carry it; their inventories are not `queryable`, so inputs waiting
 *   there are not stock and never hauled away while an order needs them);
 * - the executor of the job type `craft.produce`;
 * - a before-delete hook that cancels the orders of a deleted workstation and drops its contents;
 * - the slot-8 system `production`: sweeps crafts that lost their crafter every tick and, every 6
 *   ticks, posts craft jobs for the orders and haul jobs for the goods in work inventories;
 * - the commands `CreateProductionOrder {workstationId?, recipeId, quantity, priority?}`,
 *   `CancelProductionOrder {orderId}`, `SetProductionOrderPaused {orderId, paused}`,
 *   `SetProductionOrderPriority {orderId, priority}` and `CancelCraft {workstationId}` (DECISIONS
 *   D-10) and the queries `production-orders {workstationId?}`, `order {orderId}`,
 *   `recipes-for {workstationId}` and `workstations {}`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerZones`.
 */
export function registerProduction(engine: GameEngine): void {
  if (registered.has(engine)) {
    return;
  }
  registered.add(engine);
  registerCrafting(engine);
  engine.store.addBeforeDeleteHook((entity) => {
    destroyWorkstation(engine, entity);
    return null;
  });
  engine.registerSystem({
    id: productionSystemId,
    dependencies: [aiSystemId, jobsSystemId, storageSystemId, zonesSystemId],
    slot: TickSlot.ProductionAndConstruction,
    components: [productionOrdersComponent],
    run: (context) => {
      sweepStaleCrafts(engine);
      postCraftJobs(engine, context.tick);
      postOutputHauls(engine, context.tick);
    },
    commandHandlers: {
      CreateProductionOrder: defineCommand({
        schema: z
          .object({
            workstationId: idSchema.optional(),
            recipeId: z.string().min(1),
            quantity: z.number().int().min(1),
            priority: z.number().int().min(0).max(100).optional(),
          })
          .strict(),
        handler: (payload, target) => {
          const order = createProductionOrder(target, payload);
          return { orderId: order.orderId, workstationId: order.workstationId };
        },
      }),
      CancelProductionOrder: defineCommand({
        schema: z.object({ orderId: idSchema }).strict(),
        handler: (payload, target) => ({
          orderId: cancelProductionOrder(target, payload.orderId).orderId,
        }),
      }),
      SetProductionOrderPaused: defineCommand({
        schema: z.object({ orderId: idSchema, paused: z.boolean() }).strict(),
        handler: (payload, target) => ({
          orderId: setProductionOrderPaused(target, payload.orderId, payload.paused).orderId,
        }),
      }),
      SetProductionOrderPriority: defineCommand({
        schema: z.object({ orderId: idSchema, priority: z.number().int() }).strict(),
        handler: (payload, target) => ({
          orderId: setProductionOrderPriority(target, payload.orderId, payload.priority).orderId,
        }),
      }),
      CancelCraft: defineCommand({
        schema: z.object({ workstationId: idSchema }).strict(),
        handler: (payload, target) => ({
          interrupted: cancelCraft(target, payload.workstationId),
        }),
      }),
    },
    queries: {
      "production-orders": defineQuery({
        schema: z.object({ workstationId: idSchema.optional() }).strict(),
        run: ({ workstationId }, target) => buildOrderViews(target, workstationId),
      }),
      order: defineQuery({
        schema: z.object({ orderId: idSchema }).strict(),
        run: ({ orderId }, target) => buildOrderDetail(target, orderId),
      }),
      "recipes-for": defineQuery({
        schema: z.object({ workstationId: idSchema }).strict(),
        run: ({ workstationId }, target) => buildRecipeViews(target, workstationId),
      }),
      workstations: defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) => buildWorkstationViews(target),
      }),
    },
  });
}
