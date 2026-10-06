import { describe, expect, it } from "vitest";
import { DiplomacyError, DiplomacyErrorKind } from "./DiplomacyError";

describe("DiplomacyError", () => {
  it("carries its kind and starts the message with it", () => {
    const failure = new DiplomacyError(DiplomacyErrorKind.HostileGate, "faction 5 is hostile");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.kind).toBe(DiplomacyErrorKind.HostileGate);
    expect(failure.name).toBe("DiplomacyError");
    expect(failure.message).toBe("HostileGate: faction 5 is hostile");
  });

  it("has a distinct code for every kind and the codes of the command catalogue", () => {
    const kinds = Object.values(DiplomacyErrorKind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const code of ["UnknownFaction", "InsufficientFunds", "TargetLeaderless", "HostileGate"]) {
      expect(kinds).toContain(code);
    }
  });
});
