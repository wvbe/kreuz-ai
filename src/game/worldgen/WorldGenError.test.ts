import { describe, expect, it } from "vitest";
import { WorldGenError, WorldGenErrorKind } from "./WorldGenError";

describe("WorldGenError", () => {
  it("carries its kind and message", () => {
    const error = new WorldGenError(WorldGenErrorKind.Unreachable, "ore is cut off");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("WorldGenError");
    expect(error.kind).toBe(WorldGenErrorKind.Unreachable);
    expect(error.message).toBe("ore is cut off");
  });
});
