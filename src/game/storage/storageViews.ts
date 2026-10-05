import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { availableSlots, getAllItems, getTotal } from "../inventory/inventoryQueries";
import type { ItemQuantity } from "../inventory/inventoryTypes";
import { positionComponent } from "../map/positionComponent";
import { furnitureComponent } from "./furnitureComponent";
import { effectiveFilter } from "./materialFilter";
import { isLoosePile, listStorage, stockOf } from "./storageQueries";
import { getStorageService } from "./storageServiceRegistry";
import { stockpileComponent } from "./stockpileComponent";
import type { MaterialFilter, Reservation, StockSummary } from "./storageTypes";

/**
 * One storage entity in a stock view.
 */
export type StockHolderView = {
  readonly entityId: number;
  readonly prototype: string;
  readonly mapId: number | null;
  readonly cellIndex: number | null;
  readonly quantity: number;
  readonly reserved: number;
};

/**
 * The query `stock {materialId}`: the totals of one material and who holds it.
 */
export type StockView = StockSummary & {
  readonly holders: readonly StockHolderView[];
};

/**
 * The query `stock {}`: every material in storage plus the slot capacity.
 */
export type StockOverview = {
  readonly storages: number;
  readonly slots: number;
  readonly freeSlots: number;
  readonly materials: readonly StockSummary[];
};

/**
 * One stockpile in the query `stockpiles`.
 */
export type StockpileView = {
  readonly entityId: number;
  readonly furnitureId: string | null;
  readonly mapId: number | null;
  readonly cellIndex: number | null;
  readonly priority: number;
  readonly filter: MaterialFilter | null;
  readonly slots: number;
  readonly freeSlots: number;
  readonly weightLimitMilli: number | null;
  readonly contents: readonly ItemQuantity[];
  readonly reservations: readonly Reservation[];
};

/**
 * Totals and holders of one material (query `stock {materialId}`); only claimable storage counts.
 *
 * @param engine - The engine.
 * @param materialId - Registered material id.
 * @returns The summary with the storages that hold the material, ascending by id.
 */
export function buildStockView(engine: GameEngine, materialId: string): StockView {
  const reservations = getStorageService(engine).reservations;
  const holders: StockHolderView[] = [];
  for (const entity of listStorage(engine)) {
    const quantity = getTotal(entity, materialId);
    if (quantity > 0) {
      const place = getComponent(entity, positionComponent);
      holders.push({
        entityId: entity.id,
        prototype: entity.prototype,
        mapId: place?.mapId ?? null,
        cellIndex: place?.cellIndex ?? null,
        quantity,
        reserved: reservations.reservedQuantity(entity.id, materialId),
      });
    }
  }
  return { ...stockOf(engine, materialId), holders };
}

/**
 * Every material held in claimable storage (query `stock {}`), ascending by material id, with the
 * number of storages and their slot capacity.
 *
 * @param engine - The engine.
 * @returns The overview.
 */
export function buildStockOverview(engine: GameEngine): StockOverview {
  const storages = listStorage(engine);
  const materials = new Set<string>();
  let slots = 0;
  let freeSlots = 0;
  for (const entity of storages) {
    for (const item of getAllItems(entity)) {
      materials.add(item.materialId);
    }
    if (!isLoosePile(entity)) {
      slots += getComponent(entity, inventoryComponent)?.slotCount ?? 0;
      freeSlots += availableSlots(entity);
    }
  }
  return {
    storages: storages.length,
    slots,
    freeSlots,
    materials: [...materials].sort().map((materialId) => stockOf(engine, materialId)),
  };
}

/**
 * All stockpiles with their filter, priority, capacity and contents (query `stockpiles`),
 * ascending by entity id. The filter shown is the effective one (the own filter, else the default
 * of the furniture content).
 *
 * @param engine - The engine.
 * @returns One view per entity that carries `Stockpile`.
 */
export function buildStockpileViews(engine: GameEngine): StockpileView[] {
  const reservations = getStorageService(engine).reservations.all();
  return engine.store.entities().flatMap((entity) => {
    const stockpile = getComponent(entity, stockpileComponent);
    const inventory = getComponent(entity, inventoryComponent);
    if (stockpile === undefined || inventory === undefined) {
      return [];
    }
    const place = getComponent(entity, positionComponent);
    const furniture = getComponent(entity, furnitureComponent);
    return [
      {
        entityId: entity.id,
        furnitureId: furniture?.furnitureId ?? null,
        mapId: place?.mapId ?? null,
        cellIndex: place?.cellIndex ?? null,
        priority: stockpile.priority,
        filter: effectiveFilter(engine, entity),
        slots: inventory.slotCount,
        freeSlots: availableSlots(entity),
        weightLimitMilli: inventory.weightLimitMilli,
        contents: getAllItems(entity),
        reservations: reservations.filter((reservation) => reservation.inventoryOwnerId === entity.id),
      },
    ];
  });
}
