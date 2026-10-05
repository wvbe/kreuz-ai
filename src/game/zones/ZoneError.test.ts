import { describe, expect, it } from "vitest";
import { ZoneError, ZoneErrorKind } from "./ZoneError";

describe("ZoneError", () => {
  it("carries kind and message", () => {
    const error = new ZoneError(ZoneErrorKind.TileAlreadyZoned, "cell 4 is in zone 9");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ZoneError");
    expect(error.kind).toBe(ZoneErrorKind.TileAlreadyZoned);
    expect(error.message).toBe("cell 4 is in zone 9");
  });
});
