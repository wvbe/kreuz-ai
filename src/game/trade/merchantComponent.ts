import { z } from "zod";
import { defineComponent } from "../ecs/ComponentRegistry";

/**
 * Data of the `Merchant` component (spec 019 FR-008, FR-008b).
 */
export type MerchantData = {
  /**
   * Whether the entity takes part in trade proposals as a seller (togglable at runtime).
   */
  sellsItems: boolean;
  /**
   * Price multiplier in permille (1000 = 1.0), before faction adjustments.
   */
  priceMultiplierMilli: number;
  /**
   * Minimum margin rate in permille (100 = 0.1); null uses the content default
   * (`defaultMinimumMarginRate`).
   */
  minimumMarginRatePermille: number | null;
};

/**
 * Strict Zod schema of the serialized {@link MerchantData}.
 */
export const merchantDataSchema = z
  .object({
    sellsItems: z.boolean(),
    priceMultiplierMilli: z.number().int().min(0),
    minimumMarginRatePermille: z.number().int().min(0).nullable(),
  })
  .strict();

/**
 * The `Merchant` component: the seller settings of an entity (`sellsItems`, `priceMultiplier`,
 * `minimumMarginRate`). Traders carry it from their prototype; the commands `SetSellsItems` and
 * `SetPriceMultiplier` add it to any other entity.
 */
export const merchantComponent = defineComponent<"Merchant", MerchantData>(
  "Merchant",
  merchantDataSchema,
  () => ({ sellsItems: false, priceMultiplierMilli: 1000, minimumMarginRatePermille: null }),
);
