import { describe, expect, it } from "vitest";
import { ComponentRegistry } from "../ecs/ComponentRegistry";
import { merchantComponent, merchantDataSchema } from "./merchantComponent";

describe("merchantComponent", () => {
  it("defaults to a seller that is closed, at the plain price and the content margin", () => {
    expect(merchantComponent.defaults()).toEqual({
      sellsItems: false,
      priceMultiplierMilli: 1000,
      minimumMarginRatePermille: null,
    });
  });

  it("is registered under its name and rejects unknown or negative fields", () => {
    const registry = new ComponentRegistry();
    registry.register(merchantComponent);
    expect(
      registry.validate("Merchant", { ...merchantComponent.defaults(), sellsItems: true }),
    ).toMatchObject({ sellsItems: true });
    expect(
      merchantDataSchema.safeParse({ ...merchantComponent.defaults(), extra: 1 }).success,
    ).toBe(false);
    expect(
      merchantDataSchema.safeParse({ ...merchantComponent.defaults(), priceMultiplierMilli: -1 })
        .success,
    ).toBe(false);
  });

  it("round-trips through JSON", () => {
    const data = { sellsItems: true, priceMultiplierMilli: 1500, minimumMarginRatePermille: 50 };
    expect(merchantDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
});
