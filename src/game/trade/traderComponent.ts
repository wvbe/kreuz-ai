import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";
import type { EntityId } from "../ecs/Entity";
import { TraderPhase } from "./tradeTypes";
import type { RefineRule } from "./tradeTypes";

const materialIdSchema = z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);

/**
 * Data of the `Trader` component: what a caravan sells and buys (content, set by the prototype),
 * its refine rules (D-13) and the state of its visit.
 */
export type TraderData = {
  /**
   * Content faction the caravan belongs to (`factions.json`).
   */
  factionContentId: string;
  /**
   * The faction entity (set when the caravan is spawned), 0 until then.
   */
  factionId: EntityId;
  /**
   * Coins the trader has when it arrives.
   */
  purseCoins: number;
  /**
   * Opening bid for goods it buys, permille of their value.
   */
  buyOfferPermille: number;
  /**
   * Most the trader pays after a counter, permille of the value.
   */
  buyCeilingPermille: number;
  /**
   * Goods it brings: the stock it is refilled to at every visit.
   */
  sells: { materialId: string; quantity: number }[];
  /**
   * Materials it buys from the settlement.
   */
  buys: string[];
  /**
   * What selling raw goods earns credit for (the refined-credit ledger).
   */
  refines: RefineRule[];
  phase: TraderPhase;
  arrivedTick: number | null;
  departTick: number | null;
};

/**
 * Strict Zod schema of the serialized {@link TraderData}.
 */
export const traderDataSchema = z
  .object({
    factionContentId: z.string().min(1),
    factionId: z.number().int().min(0),
    purseCoins: z.number().int().min(0),
    buyOfferPermille: z.number().int().min(0),
    buyCeilingPermille: z.number().int().min(0),
    sells: z.array(
      z.object({ materialId: materialIdSchema, quantity: z.number().int().min(1) }).strict(),
    ),
    buys: z.array(materialIdSchema),
    refines: z.array(
      z
        .object({
          rawMaterialId: materialIdSchema,
          refinedMaterialId: materialIdSchema,
          ratioMilli: z.number().int().min(1),
        })
        .strict(),
    ),
    phase: z.nativeEnum(TraderPhase),
    arrivedTick: z.number().int().min(0).nullable(),
    departTick: z.number().int().min(0).nullable(),
  })
  .strict();

/**
 * The `Trader` component: a travelling merchant (D-13, spec 021). Traders are faction members by
 * reference (`factionId`), not citizens, so the settlement's population, idle lists and AI never
 * see them.
 */
export const traderComponent = defineComponent<"Trader", TraderData>(
  "Trader",
  traderDataSchema,
  () => ({
    factionContentId: "merchant_caravans",
    factionId: 0,
    purseCoins: 0,
    buyOfferPermille: 1000,
    buyCeilingPermille: 1000,
    sells: [],
    buys: [],
    refines: [],
    phase: TraderPhase.Arriving,
    arrivedTick: null,
    departTick: null,
  }),
);
