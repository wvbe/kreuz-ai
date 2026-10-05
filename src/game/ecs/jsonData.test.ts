import { describe, expect, it } from "vitest";
import type { JsonValue } from "../engine/EventBus";
import { EcsError } from "./EcsError";
import { cloneJson, isJsonObject, jsonEquals, jsonValueSchema, readJsonPath } from "./jsonData";

describe("jsonValueSchema", () => {
  it("accepts nested JSON with integers", () => {
    const value: JsonValue = { list: [1, "two", null, true, { deep: [3] }] };
    expect(jsonValueSchema.parse(value)).toEqual(value);
  });

  it("rejects fractions, NaN and functions", () => {
    expect(jsonValueSchema.safeParse(1.5).success).toBe(false);
    expect(jsonValueSchema.safeParse(Number.NaN).success).toBe(false);
    expect(jsonValueSchema.safeParse({ nested: [0.1] }).success).toBe(false);
    expect(jsonValueSchema.safeParse(() => 1).success).toBe(false);
  });
});

describe("isJsonObject", () => {
  it("is true only for plain objects", () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject(3)).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
  });
});

describe("cloneJson", () => {
  it("returns an independent deep copy", () => {
    const original: JsonValue = { items: [{ count: 1 }], name: "x" };
    const copy = cloneJson(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    (copy as { items: { count: number }[] }).items[0]!.count = 9;
    expect(original).toEqual({ items: [{ count: 1 }], name: "x" });
  });

  it("throws for non-integers and non-JSON values", () => {
    expect(() => cloneJson({ ratio: 0.5 })).toThrow(EcsError);
    expect(() => cloneJson(Number.POSITIVE_INFINITY)).toThrow(EcsError);
    expect(() => cloneJson(undefined as never)).toThrow(EcsError);
  });
});

describe("jsonEquals", () => {
  it("compares deeply and ignores key order", () => {
    expect(jsonEquals({ left: 1, right: [1, 2] }, { right: [1, 2], left: 1 })).toBe(true);
    expect(jsonEquals([1, 2], [1, 2, 3])).toBe(false);
    expect(jsonEquals({ key: 1 }, { key: 2 })).toBe(false);
    expect(jsonEquals({ key: 1 }, { other: 1 })).toBe(false);
    expect(jsonEquals(null, 0)).toBe(false);
    expect(jsonEquals(undefined, undefined)).toBe(true);
    expect(jsonEquals([], {})).toBe(false);
  });
});

describe("readJsonPath", () => {
  const data: JsonValue = { stats: { vigor: 5, tags: ["a"] }, flag: false };

  it("follows nested keys", () => {
    expect(readJsonPath(data, ["stats", "vigor"])).toBe(5);
    expect(readJsonPath(data, ["stats", "tags"])).toEqual(["a"]);
    expect(readJsonPath(data, ["flag"])).toBe(false);
    expect(readJsonPath(data, [])).toBe(data);
  });

  it("returns undefined for missing keys or non-object steps", () => {
    expect(readJsonPath(data, ["stats", "mp"])).toBeUndefined();
    expect(readJsonPath(data, ["flag", "x"])).toBeUndefined();
    expect(readJsonPath(undefined, ["x"])).toBeUndefined();
  });
});
