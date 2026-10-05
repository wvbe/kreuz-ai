import { describe, expect, it } from "vitest";
import { BehaviorError, BehaviorErrorKind } from "./BehaviorError";

describe("BehaviorError", () => {
  it("carries its kind and message", () => {
    const error = new BehaviorError(BehaviorErrorKind.CyclicTree, "a -> b -> a");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BehaviorError");
    expect(error.kind).toBe(BehaviorErrorKind.CyclicTree);
    expect(error.message).toBe("a -> b -> a");
  });
});
