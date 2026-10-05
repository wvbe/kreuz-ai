import { describe, expect, it } from "vitest";
import { InvalidOptionsError } from "./InvalidOptionsError";

describe("InvalidOptionsError", () => {
  it("joins the issues into its message and keeps them", () => {
    const failure = new InvalidOptionsError(["Invalid a.", "Invalid b."]);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe("InvalidOptionsError");
    expect(failure.message).toBe("Invalid a. Invalid b.");
    expect(failure.issues).toEqual(["Invalid a.", "Invalid b."]);
  });
});
