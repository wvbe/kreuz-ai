import { describe, expect, it } from "vitest";
import { UnsupportedSaveVersionError } from "./UnsupportedSaveVersionError";

describe("UnsupportedSaveVersionError", () => {
  it("names both versions", () => {
    const error = new UnsupportedSaveVersionError(5, 1);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnsupportedSaveVersionError");
    expect(error.saveVersion).toBe(5);
    expect(error.supportedVersion).toBe(1);
    expect(error.message).toContain("newer");
    expect(error.message).toContain("5");
  });
});
