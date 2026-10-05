import { describe, expect, it } from "vitest";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";

describe("InvalidSaveFormatError", () => {
  it("carries its message, issues and cause", () => {
    const cause = new Error("root");
    const error = new InvalidSaveFormatError("bad save", ["time: missing"], cause);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InvalidSaveFormatError");
    expect(error.message).toBe("bad save");
    expect(error.issues).toEqual(["time: missing"]);
    expect(error.cause).toBe(cause);
  });

  it("defaults to no issues and no cause", () => {
    const error = new InvalidSaveFormatError("bad");
    expect(error.issues).toEqual([]);
    expect(error.cause).toBeUndefined();
  });
});
