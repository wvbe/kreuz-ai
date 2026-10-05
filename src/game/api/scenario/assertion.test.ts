import { describe, expect, it } from "vitest";
import { AssertOp, evaluateAssertion, getPathValue, jsonEquals } from "./assertion";

const sample = { time: { tick: 5 }, list: [{ id: 1 }, { id: 2 }], name: "abc", none: null };

describe("getPathValue", () => {
  it("resolves keys, indices and length", () => {
    expect(getPathValue(sample, "time.tick")).toEqual({ found: true, value: 5 });
    expect(getPathValue(sample, "list.1.id")).toEqual({ found: true, value: 2 });
    expect(getPathValue(sample, "list.length")).toEqual({ found: true, value: 2 });
    expect(getPathValue(sample, "name.length")).toEqual({ found: true, value: 3 });
    expect(getPathValue(sample, "")).toEqual({ found: true, value: sample });
  });

  it("reports misses", () => {
    expect(getPathValue(sample, "time.nope")).toEqual({ found: false });
    expect(getPathValue(sample, "list.5")).toEqual({ found: false });
    expect(getPathValue(sample, "list.x")).toEqual({ found: false });
    expect(getPathValue(sample, "time.tick.deeper")).toEqual({ found: false });
    expect(getPathValue(sample, "toString")).toEqual({ found: false });
  });
});

describe("jsonEquals", () => {
  it("ignores key order and compares deeply", () => {
    expect(jsonEquals({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(jsonEquals({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEquals({ a: 1 }, { b: 1 })).toBe(false);
    expect(jsonEquals([1, 2], [1])).toBe(false);
    expect(jsonEquals([1], { 0: 1 })).toBe(false);
    expect(jsonEquals(null, null)).toBe(true);
    expect(jsonEquals(null, {})).toBe(false);
  });
});

describe("evaluateAssertion", () => {
  const found = (value: number | string | null | number[] | { [key: string]: number }) => ({
    found: true as const,
    value,
  });

  it("handles eq and exists", () => {
    expect(evaluateAssertion(AssertOp.Eq, found(3), 3)).toBe(true);
    expect(evaluateAssertion(AssertOp.Eq, found(3), 4)).toBe(false);
    expect(evaluateAssertion(AssertOp.Eq, { found: false }, 3)).toBe(false);
    expect(evaluateAssertion(AssertOp.Eq, found(3), undefined)).toBe(false);
    expect(evaluateAssertion(AssertOp.Exists, found(0), undefined)).toBe(true);
    expect(evaluateAssertion(AssertOp.Exists, found(null), undefined)).toBe(false);
    expect(evaluateAssertion(AssertOp.Exists, { found: false }, undefined)).toBe(false);
  });

  it("orders numbers only", () => {
    expect(evaluateAssertion(AssertOp.Gt, found(3), 2)).toBe(true);
    expect(evaluateAssertion(AssertOp.Gt, found(3), 3)).toBe(false);
    expect(evaluateAssertion(AssertOp.Gte, found(3), 3)).toBe(true);
    expect(evaluateAssertion(AssertOp.Lt, found(3), 4)).toBe(true);
    expect(evaluateAssertion(AssertOp.Lt, found(3), 3)).toBe(false);
    expect(evaluateAssertion(AssertOp.Lte, found(3), 3)).toBe(true);
    expect(evaluateAssertion(AssertOp.Gt, found("b"), 1)).toBe(false);
  });

  it("includes in arrays, strings and objects", () => {
    expect(evaluateAssertion(AssertOp.Includes, found([1, 2]), 2)).toBe(true);
    expect(evaluateAssertion(AssertOp.Includes, found([1, 2]), 3)).toBe(false);
    expect(evaluateAssertion(AssertOp.Includes, found("hello"), "ell")).toBe(true);
    expect(evaluateAssertion(AssertOp.Includes, found("hello"), 1)).toBe(false);
    expect(evaluateAssertion(AssertOp.Includes, found({ key: 1 }), "key")).toBe(true);
    expect(evaluateAssertion(AssertOp.Includes, found(7), "key")).toBe(false);
  });
});
