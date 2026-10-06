import { describe, expect, it } from "vitest";
import { CrierStatus } from "./crierTypes";
import { townCrierComponent, townCrierDataSchema } from "./townCrierComponent";

describe("townCrierComponent", () => {
  it("defaults to an available crier with an empty load", () => {
    expect(townCrierComponent.defaults()).toEqual({
      status: CrierStatus.Available,
      boardQueue: [],
      carrying: [],
    });
  });

  it("rejects unknown fields and bad ids", () => {
    expect(
      townCrierDataSchema.safeParse({ ...townCrierComponent.defaults(), extra: 1 }).success,
    ).toBe(false);
    expect(
      townCrierDataSchema.safeParse({ ...townCrierComponent.defaults(), carrying: [0] }).success,
    ).toBe(false);
  });
});
