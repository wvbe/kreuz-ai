import { describe, expect, it } from "vitest";
import { StandingOrderError } from "./StandingOrderError";
import { StandingOrderErrorKind } from "./standingTypes";

describe("StandingOrderError", () => {
  it("puts the kind in front of the message and keeps the candidates", () => {
    const error = new StandingOrderError(StandingOrderErrorKind.AmbiguousRecipe, "two recipes", [
      "a",
      "b",
    ]);
    expect(error.message).toBe("AmbiguousRecipe: two recipes");
    expect(error.kind).toBe(StandingOrderErrorKind.AmbiguousRecipe);
    expect(error.candidates).toEqual(["a", "b"]);
    expect(error.name).toBe("StandingOrderError");
  });

  it("has no candidates by default", () => {
    expect(new StandingOrderError(StandingOrderErrorKind.TooManyOrders, "x").candidates).toEqual(
      [],
    );
  });
});
