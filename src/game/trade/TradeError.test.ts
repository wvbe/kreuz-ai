import { describe, expect, it } from "vitest";
import { TradeError, TradeErrorKind } from "./TradeError";

describe("TradeError", () => {
  it("carries its kind and starts the message with it", () => {
    const failure = new TradeError(TradeErrorKind.TraderAbsent, "trader 5 is not at the market");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.kind).toBe(TradeErrorKind.TraderAbsent);
    expect(failure.name).toBe("TradeError");
    expect(failure.message).toBe("TraderAbsent: trader 5 is not at the market");
  });

  it("has a distinct code for every kind", () => {
    const kinds = Object.values(TradeErrorKind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toContain("RefinedCreditExhausted");
  });
});
