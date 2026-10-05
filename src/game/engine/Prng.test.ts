import { describe, expect, it } from "vitest";
import { Prng, PrngError, PrngStream } from "./Prng";
import type { PrngState } from "./Prng";

function hex(value: number): string {
  return value.toString(16).padStart(8, "0");
}

describe("PrngStream.fromInit / nextU32 (reference PCG32 vectors)", () => {
  it("matches the official pcg32 demo output for seed 42, sequence 54", () => {
    const stream = PrngStream.fromInit([0, 42], [0, 54]);
    const drawn = Array.from({ length: 6 }, () => hex(stream.nextU32()));
    expect(drawn).toEqual(["a15c02b7", "7b47f409", "ba1d3330", "83d2f293", "bfa4784b", "cbed606e"]);
  });

  it("rejects non-uint32 init words", () => {
    expect(() => PrngStream.fromInit([0, -1], [0, 1])).toThrow(PrngError);
    expect(() => PrngStream.fromInit([0, 1.5], [0, 1])).toThrow(PrngError);
  });
});

describe("Prng.create / seed", () => {
  it("accepts the boundary seeds 0 and 2^32-1", () => {
    expect(Prng.create({ seed: 0 }).seed).toBe(0);
    expect(Prng.create({ seed: 4294967295 }).seed).toBe(4294967295);
  });

  it("rejects invalid seeds", () => {
    for (const bad of [-1, 4294967296, 1.5, Number.NaN]) {
      expect(() => Prng.create({ seed: bad })).toThrow(PrngError);
    }
  });

  it("calls the injected entropy exactly once when no seed is given and records it", () => {
    let calls = 0;
    const prng = Prng.create({
      entropy: () => {
        calls += 1;
        return 777;
      },
    });
    prng.stream("a").nextU32();
    expect(calls).toBe(1);
    expect(prng.seed).toBe(777);
    expect(prng.serialize().seed).toBe(777);
  });

  it("requires a seed or entropy", () => {
    expect(() => Prng.create({})).toThrow(PrngError);
  });

  it("rejects entropy that is not a uint32", () => {
    expect(() => Prng.create({ entropy: () => -5 })).toThrow(PrngError);
  });
});

describe("determinism and golden vector", () => {
  it("same seed gives identical sequences", () => {
    const left = Prng.create({ seed: 12345 }).stream("main");
    const right = Prng.create({ seed: 12345 }).stream("main");
    for (let draw = 0; draw < 1000; draw += 1) {
      expect(left.nextU32()).toBe(right.nextU32());
    }
  });

  it("different seeds and different names diverge", () => {
    const base = Prng.create({ seed: 1 }).stream("main").nextU32();
    expect(Prng.create({ seed: 2 }).stream("main").nextU32()).not.toBe(base);
    expect(Prng.create({ seed: 1 }).stream("other").nextU32()).not.toBe(base);
  });

  it("produces the committed golden values for seed 12345", () => {
    const stream = Prng.create({ seed: 12345 }).stream("main");
    const first = Array.from({ length: 4 }, () => hex(stream.nextU32()));
    expect(first).toEqual(["9372b076", "dcae3ad5", "80e40988", "5bc2fb08"]);
  });

  it("reproduces a committed checksum over 1e6 draws", () => {
    const stream = Prng.create({ seed: 12345 }).stream("main");
    let checksum = 0;
    for (let draw = 0; draw < 1_000_000; draw += 1) {
      checksum = (Math.imul(checksum, 31) + stream.nextU32()) >>> 0;
    }
    expect(checksum).toBe(1972476307);
  });
});

describe("PrngStream helpers", () => {
  const stream = (): PrngStream => Prng.create({ seed: 99 }).stream("t");

  it("nextBelow stays in range and rejects bad ranges", () => {
    const sample = stream();
    for (let draw = 0; draw < 500; draw += 1) {
      expect(sample.nextBelow(7)).toBeLessThan(7);
    }
    expect(sample.nextBelow(1)).toBe(0);
    expect(sample.nextBelow(4294967296)).toBeGreaterThanOrEqual(0);
    expect(() => sample.nextBelow(0)).toThrow(PrngError);
    expect(() => sample.nextBelow(1.5)).toThrow(PrngError);
    expect(() => sample.nextBelow(4294967297)).toThrow(PrngError);
  });

  it("nextInt is inclusive at both ends and validates", () => {
    const sample = stream();
    const seen = new Set<number>();
    for (let draw = 0; draw < 2000; draw += 1) {
      seen.add(sample.nextInt(1, 10));
    }
    expect([...seen].sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(sample.nextInt(5, 5)).toBe(5);
    expect(sample.nextInt(-3, -1)).toBeLessThan(0);
    expect(() => sample.nextInt(3, 2)).toThrow(PrngError);
    expect(() => sample.nextInt(0.5, 2)).toThrow(PrngError);
  });

  it("chancePermille handles the extremes and validates", () => {
    const sample = stream();
    for (let draw = 0; draw < 200; draw += 1) {
      expect(sample.chancePermille(0)).toBe(false);
      expect(sample.chancePermille(1000)).toBe(true);
    }
    let hits = 0;
    for (let draw = 0; draw < 10000; draw += 1) {
      hits += sample.chancePermille(300) ? 1 : 0;
    }
    expect(hits).toBeGreaterThan(2700);
    expect(hits).toBeLessThan(3300);
    expect(() => sample.chancePermille(1001)).toThrow(PrngError);
    expect(() => sample.chancePermille(0.5)).toThrow(PrngError);
  });

  it("choice covers every element and rejects empty arrays", () => {
    const sample = stream();
    const seen = new Set<string>();
    for (let draw = 0; draw < 200; draw += 1) {
      seen.add(sample.choice(["a", "b", "c"]));
    }
    expect(seen.size).toBe(3);
    expect(() => sample.choice([])).toThrow(PrngError);
  });

  it("weighted follows integer weights and validates", () => {
    const sample = stream();
    const counts = { alpha: 0, beta: 0, gamma: 0 };
    for (let draw = 0; draw < 10000; draw += 1) {
      counts[sample.weighted(["alpha", "beta", "gamma"] as const, [50, 30, 20])] += 1;
    }
    expect(Math.abs(counts.alpha - 5000)).toBeLessThan(500);
    expect(Math.abs(counts.beta - 3000)).toBeLessThan(500);
    expect(Math.abs(counts.gamma - 2000)).toBeLessThan(500);
    expect(() => sample.weighted([], [])).toThrow(PrngError);
    expect(() => sample.weighted(["a"], [1, 2])).toThrow(PrngError);
    expect(() => sample.weighted(["a", "b"], [1, 0])).toThrow(PrngError);
    expect(() => sample.weighted(["a", "b"], [1, 0.5])).toThrow(PrngError);
    expect(() => sample.weighted(["a", "b"], [4294967296, 1])).toThrow(PrngError);
  });

  it("shuffle permutes in place deterministically", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const original = [...items];
    stream().shuffle(items);
    expect([...items].sort((left, right) => left - right)).toEqual(original);
    const again = [...original];
    stream().shuffle(again);
    expect(again).toEqual(items);
    const single = [1];
    stream().shuffle(single);
    expect(single).toEqual([1]);
  });

  it("serialize and loadState round-trip a stream", () => {
    const sample = stream();
    sample.nextU32();
    const snapshot = sample.serialize();
    const expected = [sample.nextU32(), sample.nextU32()];
    const clone = new PrngStream(snapshot);
    expect([clone.nextU32(), clone.nextU32()]).toEqual(expected);
    sample.loadState(snapshot);
    expect([sample.nextU32(), sample.nextU32()]).toEqual(expected);
    expect(() => sample.loadState({ state: [0, 0], inc: [0, 2] })).toThrow(PrngError);
  });
});

describe("Prng.stream", () => {
  it("returns the same live stream for the same name and rejects empty names", () => {
    const prng = Prng.create({ seed: 5 });
    expect(prng.stream("x")).toBe(prng.stream("x"));
    expect(() => prng.stream("")).toThrow(PrngError);
  });

  it("streams are independent of each other's progress", () => {
    const left = Prng.create({ seed: 5 });
    const right = Prng.create({ seed: 5 });
    for (let draw = 0; draw < 50; draw += 1) {
      left.stream("a").nextU32();
    }
    expect(left.stream("b").nextU32()).toBe(right.stream("b").nextU32());
  });
});

describe("Prng.serialize / fromState", () => {
  it("restores mid-sequence through JSON exactly", () => {
    const prng = Prng.create({ seed: 2024 });
    for (let draw = 0; draw < 37; draw += 1) {
      prng.stream("ai").nextU32();
      prng.stream("identity.names").nextU32();
    }
    const json = JSON.stringify(prng.serialize());
    const restored = Prng.fromState(JSON.parse(json) as PrngState);
    for (let draw = 0; draw < 100; draw += 1) {
      expect(restored.stream("ai").nextU32()).toBe(prng.stream("ai").nextU32());
      expect(restored.stream("identity.names").nextU32()).toBe(
        prng.stream("identity.names").nextU32(),
      );
    }
    expect(restored.stream("fresh").nextU32()).toBe(prng.stream("fresh").nextU32());
    expect(json.length).toBeLessThan(1000);
  });

  it("serializes streams in name order and is stable", () => {
    const prng = Prng.create({ seed: 1 });
    prng.stream("b");
    prng.stream("a");
    expect(Object.keys(prng.serialize().streams)).toEqual(["a", "b"]);
    expect(JSON.stringify(Prng.fromState(prng.serialize()).serialize())).toBe(
      JSON.stringify(prng.serialize()),
    );
  });

  it("rejects corrupt state", () => {
    const good = Prng.create({ seed: 1 });
    good.stream("a");
    const base = good.serialize();
    expect(() => Prng.fromState({ ...base, seed: -1 })).toThrow(PrngError);
    expect(() =>
      Prng.fromState({ seed: 1, streams: { alpha: { state: [0, -4], inc: [0, 1] } } }),
    ).toThrow(PrngError);
    expect(() =>
      Prng.fromState({ seed: 1, streams: { alpha: { state: [0, 4], inc: [0, 2] } } }),
    ).toThrow(PrngError);
    expect(() =>
      Prng.fromState({ seed: 1, streams: { alpha: { state: [0], inc: [0, 1] } } } as never),
    ).toThrow(PrngError);
  });
});

describe("Prng.setSeed", () => {
  it("re-seeds existing streams in place to match a fresh generator", () => {
    const prng = Prng.create({ seed: 1 });
    const held = prng.stream("a");
    held.nextU32();
    prng.setSeed(99);
    const fresh = Prng.create({ seed: 99 }).stream("a");
    expect(prng.seed).toBe(99);
    expect(held.nextU32()).toBe(fresh.nextU32());
    expect(prng.serialize().seed).toBe(99);
    expect(() => prng.setSeed(-1)).toThrow(PrngError);
  });
});
