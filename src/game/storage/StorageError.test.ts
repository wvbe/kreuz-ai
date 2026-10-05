import { describe, expect, it } from "vitest";
import { StorageError, StorageErrorKind } from "./StorageError";

describe("StorageError", () => {
  it("carries kind and message", () => {
    const error = new StorageError(StorageErrorKind.UnknownEntity, "entity 9 has no inventory");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("StorageError");
    expect(error.kind).toBe(StorageErrorKind.UnknownEntity);
    expect(error.message).toBe("entity 9 has no inventory");
  });
});
