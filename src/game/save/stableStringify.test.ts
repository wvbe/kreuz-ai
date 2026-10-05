import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { InvalidSaveFormatError } from "./InvalidSaveFormatError";
import { stableStringify } from "./stableStringify";

describe("stableStringify", () => {
  it("sorts object keys recursively and keeps array order", () => {
    expect(stableStringify({ beta: 1, alpha: { delta: [3, 1, 2], gamma: "x" } })).toBe(
      '{"alpha":{"delta":[3,1,2],"gamma":"x"},"beta":1}',
    );
  });

  it("gives integer-like keys a code-unit order, not JS numeric order", () => {
    expect(stableStringify({ "10": 1, "9": 2, "2": 3 })).toBe('{"10":1,"2":3,"9":2}');
  });

  it("is independent of key insertion order", () => {
    const first: JsonValue = { first: 1, second: { left: true, right: null } };
    const second: JsonValue = { second: { right: null, left: true }, first: 1 };
    expect(stableStringify(first)).toBe(stableStringify(second));
  });

  it("round-trips through JSON.parse", () => {
    const value: JsonValue = {
      text: 'quote " and \\ and é',
      num: -5,
      list: [],
      obj: {},
      flag: false,
    };
    expect(JSON.parse(stableStringify(value))).toEqual(value);
  });

  it("rejects fractions, -0, NaN and infinities, naming the path", () => {
    expect(() => stableStringify({ list: [1.5] })).toThrow(/\$\.list\[0\]/);
    expect(() => stableStringify(-0)).toThrow(InvalidSaveFormatError);
    expect(() => stableStringify(Number.NaN)).toThrow(InvalidSaveFormatError);
    expect(() => stableStringify(Number.POSITIVE_INFINITY)).toThrow(InvalidSaveFormatError);
  });

  it("rejects values that are not JSON", () => {
    const bad = Array.from<JsonValue>({ length: 1 });
    expect(() => stableStringify(bad)).toThrow(/undefined is not JSON/);
  });
});
