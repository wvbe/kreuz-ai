import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { settlementProgressOf } from "./settlementProgressOf";

describe("settlementProgressOf", () => {
  it("is null before a game and the government's record after newGame", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(settlementProgressOf(engine)).toBeNull();
    engine.newGame({ seed: 3 });
    expect(settlementProgressOf(engine)).toEqual({
      tier: "hamlet",
      tierReachedAtTick: { hamlet: 0 },
      milestones: [],
      evaluations: 0,
      lastEvaluationTick: null,
    });
  });

  it("returns the live data, so a change writes through", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 3 });
    const data = settlementProgressOf(engine);
    if (data === null) {
      throw new Error("no progress");
    }
    data.evaluations = 5;
    expect(settlementProgressOf(engine)?.evaluations).toBe(5);
  });
});
