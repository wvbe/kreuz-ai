import { describe, expect, it } from "vitest";
import { EcsError, EcsErrorKind } from "./EcsError";

describe("EcsError", () => {
  it("carries a kind and a message and is an Error", () => {
    const failure = new EcsError(EcsErrorKind.UnknownEntity, "no entity 7");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe("EcsError");
    expect(failure.kind).toBe(EcsErrorKind.UnknownEntity);
    expect(failure.message).toBe("no entity 7");
  });
});
