import { describe, expect, it } from "vitest";
import { createStorageWorld } from "./testStorageWorld";
import { StorageError, StorageErrorKind } from "./StorageError";
import {
  assertFilterKnown,
  effectiveFilter,
  filterAccepts,
  normalizeFilter,
} from "./materialFilter";

describe("normalizeFilter", () => {
  it("fills missing lists, sorts, de-duplicates", () => {
    expect(normalizeFilter({ categories: ["food", "drink", "food"] })).toEqual({
      categories: ["drink", "food"],
      materialIds: [],
    });
    expect(normalizeFilter({ materialIds: ["iron_ingot", "coal"] })).toEqual({
      categories: [],
      materialIds: ["coal", "iron_ingot"],
    });
  });

  it("treats null and empty lists as no filter (D-26)", () => {
    expect(normalizeFilter(null)).toBeNull();
    expect(normalizeFilter({})).toBeNull();
    expect(normalizeFilter({ categories: [], materialIds: [] })).toBeNull();
  });
});

describe("filterAccepts", () => {
  const { engine } = createStorageWorld();

  it("accepts everything without a filter", () => {
    expect(filterAccepts(engine.materials, null, "oak_log")).toBe(true);
  });

  it("matches by category or by material id, rejects the rest", () => {
    const food = { categories: ["food"], materialIds: [] };
    expect(filterAccepts(engine.materials, food, "bread")).toBe(true);
    expect(filterAccepts(engine.materials, food, "oak_log")).toBe(false);
    const ids = { categories: [], materialIds: ["iron_ingot", "coal"] };
    expect(filterAccepts(engine.materials, ids, "iron_ingot")).toBe(true);
    expect(filterAccepts(engine.materials, ids, "limestone")).toBe(false);
    const both = { categories: ["food"], materialIds: ["coal"] };
    expect(filterAccepts(engine.materials, both, "coal")).toBe(true);
    expect(filterAccepts(engine.materials, both, "bread")).toBe(true);
  });

  it("accepts all for a filter with both lists empty", () => {
    expect(filterAccepts(engine.materials, { categories: [], materialIds: [] }, "bread")).toBe(
      true,
    );
  });
});

describe("assertFilterKnown", () => {
  const { engine } = createStorageWorld();

  it("accepts known categories and materials and null", () => {
    expect(() => assertFilterKnown(engine, null)).not.toThrow();
    expect(() =>
      assertFilterKnown(engine, { categories: ["food"], materialIds: ["coal"] }),
    ).not.toThrow();
  });

  it("names an unknown category or material", () => {
    expect(() => assertFilterKnown(engine, { categories: ["gems"], materialIds: [] })).toThrow(
      expect.objectContaining({ kind: StorageErrorKind.UnknownCategory }),
    );
    expect(() => assertFilterKnown(engine, { categories: [], materialIds: ["gem"] })).toThrow(
      StorageError,
    );
  });
});

describe("effectiveFilter", () => {
  it("is the own filter, replacing the default; none for an open chest", () => {
    const world = createStorageWorld();
    const open = world.chest(3);
    expect(effectiveFilter(world.engine, open)).toBeNull();
    const filtered = world.chest(4, {
      Stockpile: { priority: 50, filter: { categories: ["food"], materialIds: [] } },
    });
    expect(effectiveFilter(world.engine, filtered)).toEqual({
      categories: ["food"],
      materialIds: [],
    });
  });
});
