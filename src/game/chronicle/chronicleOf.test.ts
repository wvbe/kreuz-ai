import { describe, expect, it } from "vitest";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { chronicleOf } from "./chronicleOf";

describe("chronicleOf", () => {
  it("is null before a game and the government's record after newGame", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    expect(chronicleOf(engine)).toBeNull();
    engine.newGame({ seed: 3 });
    expect(chronicleOf(engine)).toEqual({ moments: [], finest: [], nextMomentId: 1 });
  });

  it("returns the live data, so a change writes through", () => {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed: 3 });
    const data = chronicleOf(engine);
    if (data === null) {
      throw new Error("no chronicle");
    }
    data.nextMomentId = 9;
    expect(chronicleOf(engine)?.nextMomentId).toBe(9);
  });
});
