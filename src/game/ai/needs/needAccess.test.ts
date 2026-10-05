import { describe, expect, it } from "vitest";
import { loadContent } from "../../content/ContentLoader";
import type { Entity } from "../../ecs/Entity";
import { adjustNeed, criticalNeedsOf, getNeedValue, initialNeedValues } from "./needAccess";

const content = loadContent();

function entity(values: { needId: string; valueMilli: number }[]): Entity {
  return { id: 1, prototype: "farmer", components: { Needs: { values } } };
}

describe("initialNeedValues", () => {
  it("lists every need at the start value, ascending by id", () => {
    const values = initialNeedValues(content.needs.all(), 80_000);
    expect(values.map((value) => value.needId)).toEqual([
      "comfort",
      "faith",
      "hunger",
      "rest",
      "safety",
      "social",
    ]);
    expect(values.every((value) => value.valueMilli === 80_000)).toBe(true);
  });
});

describe("getNeedValue", () => {
  it("reads a need, or null for unknown needs and entities without Needs", () => {
    const subject = entity([{ needId: "hunger", valueMilli: 55_000 }]);
    expect(getNeedValue(subject, "hunger")).toBe(55_000);
    expect(getNeedValue(subject, "rest")).toBeNull();
    expect(getNeedValue({ id: 2, prototype: "wall", components: {} }, "hunger")).toBeNull();
  });
});

describe("adjustNeed", () => {
  it("adds a signed delta and clamps to the meter range", () => {
    const subject = entity([{ needId: "hunger", valueMilli: 90_000 }]);
    expect(adjustNeed(subject, "hunger", 30_000)).toBe(100_000);
    expect(adjustNeed(subject, "hunger", -250_000)).toBe(0);
    expect(getNeedValue(subject, "hunger")).toBe(0);
  });

  it("returns null for a need the entity does not have", () => {
    expect(adjustNeed(entity([]), "hunger", 5)).toBeNull();
  });
});

describe("criticalNeedsOf", () => {
  it("lists critical needs in content order", () => {
    const subject = entity([
      { needId: "faith", valueMilli: 30_000 },
      { needId: "hunger", valueMilli: 20_000 },
      { needId: "rest", valueMilli: 21_000 },
    ]);
    expect(criticalNeedsOf(content.needs, subject).map((need) => need.id)).toEqual([
      "hunger",
      "faith",
    ]);
  });

  it("is empty for an entity without Needs", () => {
    expect(criticalNeedsOf(content.needs, { id: 2, prototype: "wall", components: {} })).toEqual(
      [],
    );
  });
});
