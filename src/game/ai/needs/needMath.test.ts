import { describe, expect, it } from "vitest";
import { loadContent } from "../../content/ContentLoader";
import type { Entity } from "../../ecs/Entity";
import { clampMeter, decayAmountMilli, isCritical, satisfactionAmountMilli } from "./needMath";

const content = loadContent();

function entityWithTraits(ids: string[]): Entity {
  return { id: 1, prototype: "farmer", components: { Traits: { ids } } };
}

describe("clampMeter", () => {
  it("keeps values inside 0..100000", () => {
    expect(clampMeter(-5)).toBe(0);
    expect(clampMeter(120_000)).toBe(100_000);
    expect(clampMeter(42_000)).toBe(42_000);
  });
});

describe("decayAmountMilli", () => {
  const hunger = content.needs.require("hunger");

  it("is the authored decay at difficulty 1000", () => {
    expect(decayAmountMilli(content, entityWithTraits([]), hunger, 1000)).toBe(150);
  });

  it("scales with the difficulty multiplier and never reaches zero", () => {
    expect(decayAmountMilli(content, entityWithTraits([]), hunger, 1300)).toBe(195);
    expect(decayAmountMilli(content, entityWithTraits([]), hunger, 700)).toBe(105);
    expect(decayAmountMilli(content, entityWithTraits([]), hunger, 1)).toBe(1);
  });

  it("applies the need modifiers of traits (hearty: hunger x0.8)", () => {
    expect(decayAmountMilli(content, entityWithTraits(["hearty"]), hunger, 1000)).toBe(120);
    const rest = content.needs.require("rest");
    expect(decayAmountMilli(content, entityWithTraits(["hearty"]), rest, 1000)).toBe(150);
    expect(decayAmountMilli(content, entityWithTraits(["tireless"]), rest, 1000)).toBe(105);
  });
});

describe("satisfactionAmountMilli", () => {
  it("returns the authored amount when no trait changes satisfaction", () => {
    expect(satisfactionAmountMilli(content, entityWithTraits(["hearty"]), "hunger", 30_000)).toBe(
      30_000,
    );
  });
});

describe("isCritical", () => {
  const hunger = content.needs.require("hunger");

  it("is true at or below the threshold", () => {
    expect(isCritical(hunger, 20_000)).toBe(true);
    expect(isCritical(hunger, 0)).toBe(true);
    expect(isCritical(hunger, 20_001)).toBe(false);
  });
});
