import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionError, SaveSectionLocation, SaveSectionRegistry } from "./SaveSectionRegistry";
import type { SaveSection } from "./SaveSectionRegistry";

function section(key: string, location = SaveSectionLocation.Root, order?: number): SaveSection {
  const value: JsonValue = 0;
  return {
    key,
    location,
    schema: z.number().int(),
    serialize: () => value,
    restore: () => undefined,
    ...(order === undefined ? {} : { order }),
  };
}

describe("SaveSectionRegistry", () => {
  it("registers and finds sections by location and key", () => {
    const registry = new SaveSectionRegistry();
    registry.register(section("statuses"));
    registry.register(section("trade", SaveSectionLocation.Systems));
    expect(registry.get(SaveSectionLocation.Root, "statuses")?.key).toBe("statuses");
    expect(registry.get(SaveSectionLocation.Systems, "statuses")).toBeUndefined();
    expect(registry.listAt(SaveSectionLocation.Systems).map((entry) => entry.key)).toEqual([
      "trade",
    ]);
  });

  it("allows the same key in different locations", () => {
    const registry = new SaveSectionRegistry();
    registry.register(section("stewardship"));
    registry.register(section("stewardship", SaveSectionLocation.Systems));
    expect(registry.list()).toHaveLength(2);
  });

  it("lists by order then registration sequence", () => {
    const registry = new SaveSectionRegistry();
    registry.register(section("late", SaveSectionLocation.Root, 5));
    registry.register(section("first"));
    registry.register(section("second"));
    registry.register(section("early", SaveSectionLocation.Systems, -1));
    expect(registry.list().map((entry) => entry.key)).toEqual(["early", "first", "second", "late"]);
  });

  it("rejects duplicates, bad keys and reserved root keys", () => {
    const registry = new SaveSectionRegistry();
    registry.register(section("statuses"));
    expect(() => registry.register(section("statuses"))).toThrow(SaveSectionError);
    expect(() => registry.register(section("Bad Key"))).toThrow(/invalid save section key/);
    expect(() => registry.register(section("entities"))).toThrow(/reserved/);
    registry.register(section("entities", SaveSectionLocation.Systems));
  });
});
