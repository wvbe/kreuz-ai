import { describe, expect, it } from "vitest";
import { ConstructionError, ConstructionErrorKind } from "./ConstructionError";

describe("ConstructionError", () => {
  it("carries kind and message", () => {
    const error = new ConstructionError(ConstructionErrorKind.UnknownJob, "job 4 does not exist");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ConstructionError");
    expect(error.kind).toBe(ConstructionErrorKind.UnknownJob);
    expect(error.message).toBe("job 4 does not exist");
  });
});
