import { describe, expect, it } from "vitest";
import { maxMoodInfluences } from "../aiTypes";
import type { MoodData } from "../aiTypes";
import { activeInfluences, addMoodInfluence, moodTargetMilli, stepMood } from "./moodModel";

function mood(influences: MoodData["influences"] = []): MoodData {
  return { valueMilli: 50_000, influences };
}

describe("activeInfluences", () => {
  it("keeps influences whose untilTick has not passed", () => {
    const data = mood([
      { source: "old", deltaMilli: 5, untilTick: 9 },
      { source: "now", deltaMilli: 5, untilTick: 10 },
      { source: "later", deltaMilli: 5, untilTick: 11 },
    ]);
    expect(activeInfluences(data, 10).map((item) => item.source)).toEqual(["now", "later"]);
  });
});

describe("moodTargetMilli", () => {
  it("adds needs, influences and trait bonus, clamped", () => {
    expect(moodTargetMilli(60_000, 5_000, -2_000)).toBe(63_000);
    expect(moodTargetMilli(95_000, 20_000, 0)).toBe(100_000);
    expect(moodTargetMilli(10_000, -30_000, 0)).toBe(0);
  });
});

describe("stepMood", () => {
  it("closes a share of the gap per tick", () => {
    expect(stepMood(50_000, 70_000, 50)).toBe(51_000);
    expect(stepMood(70_000, 50_000, 50)).toBe(69_000);
  });

  it("moves at least one unit and never overshoots", () => {
    expect(stepMood(50_000, 50_003, 50)).toBe(50_001);
    expect(stepMood(50_000, 49_999, 50)).toBe(49_999);
    expect(stepMood(50_000, 50_000, 50)).toBe(50_000);
  });

  it("converges to the target", () => {
    let current = 0;
    for (let tick = 0; tick < 2000; tick += 1) {
      current = stepMood(current, 80_000, 50);
    }
    expect(current).toBe(80_000);
  });
});

describe("addMoodInfluence", () => {
  it("appends and drops expired influences", () => {
    const data = mood([{ source: "stale", deltaMilli: 1, untilTick: 3 }]);
    addMoodInfluence(data, { source: "fresh", deltaMilli: 2, untilTick: 50 }, 10);
    expect(data.influences).toEqual([{ source: "fresh", deltaMilli: 2, untilTick: 50 }]);
  });

  it(`keeps at most ${maxMoodInfluences} influences, evicting the oldest`, () => {
    const data = mood();
    for (let index = 0; index < maxMoodInfluences + 3; index += 1) {
      addMoodInfluence(data, { source: `s${index}`, deltaMilli: 1, untilTick: 100 }, 0);
    }
    expect(data.influences).toHaveLength(maxMoodInfluences);
    expect(data.influences[0]?.source).toBe("s3");
    expect(data.influences.at(-1)?.source).toBe(`s${maxMoodInfluences + 2}`);
  });
});
