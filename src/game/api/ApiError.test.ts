import { describe, expect, it } from "vitest";
import { ApiError, ApiErrorKind } from "./ApiError";

describe("ApiError", () => {
  it("carries kind, message and issues", () => {
    const failure = new ApiError(ApiErrorKind.InvalidPayload, "bad", ["a: wrong"]);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe("ApiError");
    expect(failure.kind).toBe(ApiErrorKind.InvalidPayload);
    expect(failure.message).toBe("bad");
    expect(failure.issues).toEqual(["a: wrong"]);
    expect(new ApiError(ApiErrorKind.NoGame, "x").issues).toEqual([]);
  });

  it("uses stable kebab-case string values", () => {
    for (const kind of Object.values(ApiErrorKind)) {
      expect(kind).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});
