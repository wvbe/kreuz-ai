import { describe, expect, it } from "vitest";
import { ProductionError, ProductionErrorKind } from "./ProductionError";

describe("ProductionError", () => {
  it("carries kind and message", () => {
    const error = new ProductionError(ProductionErrorKind.UnknownOrder, "order 4 does not exist");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ProductionError");
    expect(error.kind).toBe(ProductionErrorKind.UnknownOrder);
    expect(error.message).toBe("order 4 does not exist");
  });
});
