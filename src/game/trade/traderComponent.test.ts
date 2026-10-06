import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { traderComponent, traderDataSchema } from "./traderComponent";
import { TraderPhase, traderPrototypeId } from "./tradeTypes";

describe("traderComponent", () => {
  it("defaults to an empty caravan that has not arrived", () => {
    const data = traderComponent.defaults();
    expect(data.phase).toBe(TraderPhase.Arriving);
    expect(data.sells).toEqual([]);
    expect(data.refines).toEqual([]);
    expect(data.arrivedTick).toBeNull();
    expect(data.factionId).toBe(0);
  });

  it("is strict and round-trips through JSON", () => {
    const data = {
      ...traderComponent.defaults(),
      sells: [{ materialId: "nails", quantity: 5 }],
      buys: ["iron_ore"],
      refines: [{ rawMaterialId: "iron_ore", refinedMaterialId: "iron_ingot", ratioMilli: 500 }],
    };
    expect(traderDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(traderDataSchema.safeParse({ ...data, extra: true }).success).toBe(false);
    expect(
      traderDataSchema.safeParse({
        ...data,
        refines: [{ rawMaterialId: "iron_ore", refinedMaterialId: "iron_ingot", ratioMilli: 0 }],
      }).success,
    ).toBe(false);
  });

  it("is authored on the caravan prototype with the iron refine rule (D-13)", () => {
    const content = loadContent();
    const caravan = content.enginePrototypes.require(traderPrototypeId);
    const trader = caravan.components["Trader"];
    expect(traderDataSchema.parse({ ...traderComponent.defaults(), ...trader }).refines).toEqual([
      { rawMaterialId: "iron_ore", refinedMaterialId: "iron_ingot", ratioMilli: 500 },
    ]);
  });
});
