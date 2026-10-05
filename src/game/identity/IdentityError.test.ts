import { describe, expect, it } from "vitest";
import { IdentityError, IdentityErrorKind } from "./IdentityError";

describe("IdentityError", () => {
  it("carries a kind and message", () => {
    const error = new IdentityError(IdentityErrorKind.DanglingReference, "unknown name list");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("IdentityError");
    expect(error.kind).toBe(IdentityErrorKind.DanglingReference);
    expect(error.message).toBe("unknown name list");
  });
});
