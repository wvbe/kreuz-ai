import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const summarySchema = z.object({
  materialId: z.string(),
  total: z.number(),
  reserved: z.number(),
  available: z.number(),
  free: z.number(),
});

const overviewSchema = z.object({
  storages: z.number(),
  slots: z.number(),
  freeSlots: z.number(),
  materials: z.array(summarySchema),
});

const materialViewSchema = summarySchema.extend({
  holders: z.array(
    z.object({
      entityId: z.number(),
      prototype: z.string(),
      cellIndex: z.number().nullable(),
      quantity: z.number(),
      reserved: z.number(),
    }),
  ),
});

const stockpileSchema = z.object({
  entityId: z.number(),
  furnitureId: z.string().nullable(),
  mapId: z.number().nullable(),
  cellIndex: z.number().nullable(),
  priority: z.number(),
  filter: z
    .object({ categories: z.array(z.string()), materialIds: z.array(z.string()) })
    .nullable(),
  slots: z.number(),
  freeSlots: z.number(),
  contents: z.array(z.object({ materialId: z.string(), quantity: z.number() })),
  reservations: z.array(z.object({ id: z.number() })),
});

type Summary = z.infer<typeof summarySchema>;

function formatSummary(summary: Summary): string {
  return `  ${summary.materialId}: total ${summary.total}, reserved ${summary.reserved}, available ${summary.available}, room for ${summary.free} more`;
}

/**
 * Formats the `stock {}` query for the `stock` verb: the storage and slot counts and one line
 * per material held in claimable storage.
 *
 * @param view - Data of the `stock` query without a material.
 * @returns Output lines, empty when the view is not a stock overview.
 */
export function formatStockOverview(view: JsonValue): string[] {
  const parsed = overviewSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const overview = parsed.data;
  return [
    `stock: ${overview.storages} storages, ${overview.slots} slots (${overview.freeSlots} free)`,
    ...(overview.materials.length === 0
      ? ["  nothing stored"]
      : overview.materials.map(formatSummary)),
  ];
}

/**
 * Formats the `stock {materialId}` query: the totals and the storages holding the material.
 *
 * @param view - Data of the `stock` query for one material.
 * @returns Output lines, empty when the view is not a material stock.
 */
export function formatStockMaterial(view: JsonValue): string[] {
  const parsed = materialViewSchema.safeParse(view);
  if (!parsed.success) {
    return [];
  }
  const stock = parsed.data;
  return [
    `stock of ${stock.materialId}:`,
    formatSummary(stock),
    ...stock.holders.map(
      (holder) =>
        `  #${holder.entityId} ${holder.prototype} at cell ${holder.cellIndex ?? "?"}: ${holder.quantity}${holder.reserved > 0 ? ` (${holder.reserved} reserved)` : ""}`,
    ),
  ];
}

/**
 * Formats the `stockpiles` query: one line per stockpile with its priority, filter, free slots and
 * contents.
 *
 * @param view - Data of the `stockpiles` query.
 * @returns Output lines; a note when there are none.
 */
export function formatStockpiles(view: JsonValue): string[] {
  const parsed = z.array(stockpileSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no stockpiles"];
  }
  return parsed.data.map((pile) => {
    const filter =
      pile.filter === null
        ? "all"
        : [...pile.filter.categories, ...pile.filter.materialIds].join(",");
    const contents =
      pile.contents.length === 0
        ? "empty"
        : pile.contents.map((item) => `${item.quantity} ${item.materialId}`).join(", ");
    const reserved =
      pile.reservations.length === 0 ? "" : `, ${pile.reservations.length} reservations`;
    return `  #${pile.entityId} ${pile.furnitureId ?? "storage"} at cell ${pile.cellIndex ?? "?"} prio ${pile.priority} accepts ${filter}, ${pile.freeSlots}/${pile.slots} slots free: ${contents}${reserved}`;
  });
}
