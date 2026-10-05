import { describe, expect, it } from "vitest";
import { MapError, MapErrorKind } from "./MapError";

describe("MapError", () => {
  it("carries its kind and message", () => {
    const error = new MapError(MapErrorKind.UnknownMap, "no map 3");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MapError");
    expect(error.kind).toBe(MapErrorKind.UnknownMap);
    expect(error.message).toBe("no map 3");
  });
});
