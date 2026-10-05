import { describe, expect, it } from "vitest";
import { parseCount, verbDone, verbFailed } from "./Verb";

describe("verbDone", () => {
  it("joins lines", () => {
    expect(verbDone(["a", "b"])).toEqual({ ok: true, text: "a\nb" });
  });
});

describe("verbFailed", () => {
  it("prefixes the message", () => {
    expect(verbFailed("nope")).toEqual({ ok: false, text: "error: nope" });
  });
});

describe("parseCount", () => {
  it("accepts digits only", () => {
    expect(parseCount("12")).toBe(12);
    expect(parseCount("0")).toBe(0);
    expect(parseCount("-1")).toBeNull();
    expect(parseCount("1.5")).toBeNull();
    expect(parseCount("x")).toBeNull();
    expect(parseCount(undefined)).toBeNull();
  });
});
