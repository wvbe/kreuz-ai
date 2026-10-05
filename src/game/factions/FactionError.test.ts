import { describe, expect, it } from "vitest";
import { FactionError, FactionErrorKind } from "./FactionError";

describe("FactionError", () => {
  it("carries a kind and message", () => {
    const error = new FactionError(FactionErrorKind.NotMember, "entity 3 is not a member");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("FactionError");
    expect(error.kind).toBe(FactionErrorKind.NotMember);
    expect(error.message).toBe("entity 3 is not a member");
    expect(FactionErrorKind.DanglingReference).toBe("dangling-reference");
    expect(FactionErrorKind.UnknownFaction).toBe("unknown-faction");
    expect(FactionErrorKind.NotCitizen).toBe("not-citizen");
  });
});
