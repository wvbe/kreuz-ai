import { describe, expect, it } from "vitest";
import { DispatchFailureReason, EnvoyStatus } from "./diplomacyTypes";
import { envoyComponent, envoyDataSchema } from "./envoyComponent";

describe("envoyComponent", () => {
  it("defaults to a traveling overture without cargo", () => {
    expect(envoyComponent.name).toBe("Envoy");
    expect(envoyComponent.defaults()).toMatchObject({
      actType: "overture",
      status: EnvoyStatus.Traveling,
      cargo: [],
      failure: null,
      returnTick: null,
    });
  });

  it("round trips JSON with cargo and a failure", () => {
    const data = {
      ...envoyComponent.defaults(),
      cargo: [{ materialId: "silver_penny", quantity: 100 }],
      giftValueCoins: 100,
      status: EnvoyStatus.Returning,
      failure: DispatchFailureReason.Unreachable,
      returnTick: 900,
    };
    expect(envoyDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects unknown fields, bad enums and empty cargo stacks", () => {
    const base = envoyComponent.defaults();
    expect(envoyDataSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(envoyDataSchema.safeParse({ ...base, status: "lost" }).success).toBe(false);
    expect(
      envoyDataSchema.safeParse({ ...base, cargo: [{ materialId: "bread", quantity: 0 }] }).success,
    ).toBe(false);
    expect(envoyDataSchema.safeParse({ ...base, travelTicks: 0 }).success).toBe(false);
  });
});
