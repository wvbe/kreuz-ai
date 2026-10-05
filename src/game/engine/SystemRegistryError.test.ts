import { describe, expect, it } from "vitest";
import { SystemRegistryError, SystemRegistryErrorKind } from "./SystemRegistryError";

describe("SystemRegistryError", () => {
  it("carries a kind and a message", () => {
    const failure = new SystemRegistryError(SystemRegistryErrorKind.DependencyCycle, "a -> a");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe("SystemRegistryError");
    expect(failure.kind).toBe(SystemRegistryErrorKind.DependencyCycle);
    expect(failure.message).toBe("a -> a");
  });
});
