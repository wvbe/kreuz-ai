import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import { getAiService } from "../ai/aiServiceRegistry";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { TickSlot } from "../engine/TickPipeline";
import { getTotal } from "../inventory/inventoryQueries";
import { jobsSystemId } from "../jobs/jobTypes";
import { releaseOrphanedHaulReservations, postHaulJobs } from "./haulPoster";
import { registerHauling } from "./haulDeliver";
import { furnitureComponent } from "./furnitureComponent";
import { assertFilterKnown, normalizeFilter } from "./materialFilter";
import { StorageError, StorageErrorKind } from "./StorageError";
import { StorageService } from "./StorageService";
import { bindStorageService, getStorageService } from "./storageServiceRegistry";
import { storageNeedSource } from "./storageNeedSource";
import { stockpileComponent } from "./stockpileComponent";
import { maxStockpilePriority, reservationsSystemId, storageSystemId } from "./storageTypes";
import { buildStockOverview, buildStockView, buildStockpileViews } from "./storageViews";

const registered = new WeakSet<GameEngine>();

const filterSchema = z
  .object({
    categories: z.array(z.string().min(1)).optional(),
    materialIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

/**
 * Registers storage with an engine (once per engine; the engine does it for itself, so every game
 * has it). It adds:
 * - the components `Furniture` and `Stockpile` (the worldgen `chest` prototype carries both) and
 *   the save sections `systems.reservations` (D-09) and `systems.storage` (no-destination marks);
 * - the executor of the job type `haul.deliver`;
 * - the storage need source (settlers eat bread from stockpiles) and the reservation-aware item
 *   availability of the AI;
 * - a before-delete hook that releases the reservations of a deleted holder or inventory owner;
 * - the slot-10 system `storage`: reconciles reservations with the stock, releases orphaned haul
 *   reservations and runs the haul poster;
 * - the commands `SetStorageMaterialFilter {entityId, filter|null}` and
 *   `SetStockpilePriority {entityId, priority}` and the queries `stock {materialId?}`,
 *   `stockpiles {}` and `reservations {}`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`.
 * @returns The engine's storage service.
 */
export function registerStorage(engine: GameEngine): StorageService {
  if (registered.has(engine)) {
    return getStorageService(engine);
  }
  registered.add(engine);
  const service = new StorageService(engine);
  bindStorageService(engine, service);
  registerHauling(engine);
  const aiService = getAiService(engine);
  aiService.registerNeedSource(storageNeedSource);
  aiService.setItemAvailability((target, holder, consumer, materialId) =>
    Math.min(
      getTotal(holder, materialId),
      service.reservations.availableTo(holder.id, materialId, consumer.id),
    ),
  );
  engine.store.addBeforeDeleteHook((entity) => {
    service.reservations.releaseHolder(entity.id);
    service.reservations.releaseInventory(entity.id);
    return null;
  });
  const requireStockpile = (target: GameEngine, entityId: number) => {
    const entity = target.store.get(entityId);
    if (entity === undefined) {
      throw new StorageError(StorageErrorKind.UnknownEntity, `entity ${entityId} does not exist`);
    }
    if (getComponent(entity, stockpileComponent) === undefined) {
      throw new StorageError(
        StorageErrorKind.NotAStockpile,
        `entity ${entityId} is not a stockpile`,
      );
    }
    return entity;
  };
  engine.registerSystem({
    id: reservationsSystemId,
    saveSection: service.reservations.createSection(),
  });
  engine.registerSystem({
    id: storageSystemId,
    dependencies: [aiSystemId, jobsSystemId],
    slot: TickSlot.StockpileTradeTreasury,
    components: [furnitureComponent, stockpileComponent],
    saveSection: service.createSection(),
    run: (context) => {
      service.reservations.reconcile();
      releaseOrphanedHaulReservations(engine);
      postHaulJobs(engine, context.tick);
    },
    commandHandlers: {
      SetStorageMaterialFilter: defineCommand({
        schema: z
          .object({ entityId: z.number().int().min(1), filter: filterSchema.nullable() })
          .strict(),
        handler: (payload, target) => {
          const entity = requireStockpile(target, payload.entityId);
          const filter = normalizeFilter(payload.filter);
          assertFilterKnown(target, filter);
          const data = getComponent(entity, stockpileComponent);
          if (data !== undefined) {
            data.filter = filter;
          }
          return { entityId: entity.id };
        },
      }),
      SetStockpilePriority: defineCommand({
        schema: z
          .object({
            entityId: z.number().int().min(1),
            priority: z.number().int().min(0).max(maxStockpilePriority),
          })
          .strict(),
        handler: (payload, target) => {
          const entity = requireStockpile(target, payload.entityId);
          const data = getComponent(entity, stockpileComponent);
          if (data !== undefined) {
            data.priority = payload.priority;
          }
          return { entityId: entity.id };
        },
      }),
    },
    queries: {
      stock: defineQuery({
        schema: z.object({ materialId: z.string().min(1).optional() }).strict(),
        run: ({ materialId }, target) => {
          if (materialId === undefined) {
            return buildStockOverview(target);
          }
          if (!target.materials.has(materialId)) {
            throw new StorageError(
              StorageErrorKind.UnknownMaterial,
              `material "${materialId}" is not in the content pack`,
            );
          }
          return buildStockView(target, materialId);
        },
      }),
      stockpiles: defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) => buildStockpileViews(target),
      }),
      reservations: defineQuery({
        schema: z.object({}).strict(),
        run: (_args, target) => getStorageService(target).reservations.all(),
      }),
    },
  });
  return service;
}
