import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import { defaultStockpilePriority, maxStockpilePriority } from "./storageTypes";
import type { StockpileData } from "./storageTypes";

const contentId = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Strict Zod schema of a serialized {@link MaterialFilter}: both lists present, content ids.
 */
export const materialFilterSchema = z
  .object({
    categories: z.array(z.string().regex(contentId)),
    materialIds: z.array(z.string().regex(contentId)),
  })
  .strict();

/**
 * Strict Zod schema of the serialized {@link StockpileData}.
 */
export const stockpileDataSchema = z
  .object({
    priority: z.number().int().min(0).max(maxStockpilePriority),
    filter: materialFilterSchema.nullable(),
  })
  .strict();

/**
 * The `Stockpile` component (spec 018 FR-003/004, DECISIONS D-26): a storage furniture that
 * haulers route goods to. It carries the player-configurable routing `priority` and an optional
 * material filter that replaces the default filter of the furniture content. Defaults: priority
 * 50, no filter (accepts everything). The inventory itself is the ordinary `Inventory` component
 * on the same entity.
 */
export const stockpileComponent = defineComponent<"Stockpile", StockpileData>(
  "Stockpile",
  stockpileDataSchema,
  () => ({ priority: defaultStockpilePriority, filter: null }),
);
