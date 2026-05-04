/**
 * Stockpile system: storage zones, hauling job generation.
 */

export type Stockpile = {
  stockpileId: string;
  zoneId: string;
  allowedMaterials: string[];
  items: Map<string, number>;
  capacity: number;
};

export type StockpileSystem = {
  stockpiles: Map<string, Stockpile>;
};

/**
 * Creates a new stockpile system.
 */
export function createStockpileSystem(): StockpileSystem {
  return { stockpiles: new Map() };
}

/**
 * Creates a stockpile zone.
 */
export function createStockpile(
  system: StockpileSystem,
  stockpileId: string,
  zoneId: string,
  allowedMaterials: string[],
  capacity: number,
): Stockpile {
  const stockpile: Stockpile = {
    stockpileId,
    zoneId,
    allowedMaterials,
    items: new Map(),
    capacity,
  };
  system.stockpiles.set(stockpileId, stockpile);
  return stockpile;
}

/**
 * Deposits an item into a stockpile.
 */
export function depositItem(
  stockpile: Stockpile,
  materialId: string,
  quantity: number,
): number {
  if (!stockpile.allowedMaterials.includes(materialId) && stockpile.allowedMaterials.length > 0) {
    return 0;
  }
  const currentTotal = [...stockpile.items.values()].reduce((sum, qty) => sum + qty, 0);
  const available = stockpile.capacity - currentTotal;
  const toDeposit = Math.min(quantity, available);
  if (toDeposit > 0) {
    stockpile.items.set(materialId, (stockpile.items.get(materialId) ?? 0) + toDeposit);
  }
  return toDeposit;
}

/**
 * Withdraws an item from a stockpile.
 */
export function withdrawItem(
  stockpile: Stockpile,
  materialId: string,
  quantity: number,
): number {
  const available = stockpile.items.get(materialId) ?? 0;
  const toWithdraw = Math.min(quantity, available);
  if (toWithdraw > 0) {
    const remaining = available - toWithdraw;
    if (remaining > 0) {
      stockpile.items.set(materialId, remaining);
    } else {
      stockpile.items.delete(materialId);
    }
  }
  return toWithdraw;
}
