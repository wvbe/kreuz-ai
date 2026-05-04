import { describe, it, expect } from "vitest";
import { createPrng, nextRandom, randomInt, randomFloat, shuffle, pickRandom } from "./Prng.js";

describe("Prng", () => {
  it("produces deterministic sequence for same seed", () => {
    const prng1 = createPrng(42);
    const prng2 = createPrng(42);
    const { value: val1 } = nextRandom(prng1);
    const { value: val2 } = nextRandom(prng2);
    expect(val1).toBe(val2);
  });

  it("produces different sequences for different seeds", () => {
    const { value: val1 } = nextRandom(createPrng(42));
    const { value: val2 } = nextRandom(createPrng(123));
    expect(val1).not.toBe(val2);
  });

  it("generates values in [0, 1)", () => {
    let prng = createPrng(1);
    for (let index = 0; index < 1000; index++) {
      const result = nextRandom(prng);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(1);
      prng = result.prng;
    }
  });

  it("randomInt generates values in [min, max]", () => {
    let prng = createPrng(99);
    for (let index = 0; index < 100; index++) {
      const result = randomInt(prng, 5, 10);
      expect(result.value).toBeGreaterThanOrEqual(5);
      expect(result.value).toBeLessThanOrEqual(10);
      expect(Number.isInteger(result.value)).toBe(true);
      prng = result.prng;
    }
  });

  it("randomFloat generates values in [min, max)", () => {
    let prng = createPrng(7);
    for (let index = 0; index < 100; index++) {
      const result = randomFloat(prng, 2.0, 5.0);
      expect(result.value).toBeGreaterThanOrEqual(2.0);
      expect(result.value).toBeLessThan(5.0);
      prng = result.prng;
    }
  });

  it("shuffle preserves all elements", () => {
    const prng = createPrng(55);
    const array = [1, 2, 3, 4, 5];
    const { value: shuffled } = shuffle(prng, array);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("shuffle is deterministic", () => {
    const { value: first } = shuffle(createPrng(55), [1, 2, 3, 4, 5]);
    const { value: second } = shuffle(createPrng(55), [1, 2, 3, 4, 5]);
    expect(first).toEqual(second);
  });

  it("pickRandom returns an element from the array", () => {
    const prng = createPrng(33);
    const items = ["a", "b", "c"];
    const { value } = pickRandom(prng, items);
    expect(items).toContain(value);
  });
});
