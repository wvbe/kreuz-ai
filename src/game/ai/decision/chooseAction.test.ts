import { describe, expect, it } from "vitest";
import { BehaviorError } from "../../behavior/BehaviorError";
import { chooseAction, scoreCandidates } from "./chooseAction";
import type { ActionCandidate, DecisionFactor } from "./chooseAction";
import type { DecisionContext } from "./decisionContext";

const context: DecisionContext = {
  entityId: 1,
  tick: 1,
  needs: [],
  needCount: 0,
  moodMilli: 50_000,
  riskSuccessPermille: 500,
  relationships: { count: 0, meanAffinityMilli: 0 },
  coins: 0,
  wealth: "modest" as DecisionContext["wealth"],
};

function candidate(id: string, base: number): ActionCandidate {
  return { id, needId: null, base };
}

const plusTen: DecisionFactor = { id: "plus_ten", score: () => 10 };
const favourB: DecisionFactor = {
  id: "favour_b",
  score: (_context, item) => (item.id === "b" ? 100 : 0),
};

// @covers 013:FR-014 013:FR-017 013:FR-022 013:SC-013
describe("scoreCandidates", () => {
  it("scores base plus the sum of all factors", () => {
    const scored = scoreCandidates(
      [candidate("a", 5), candidate("b", 7)],
      [plusTen, favourB],
      context,
    );
    expect(scored.map((item) => item.total)).toEqual([15, 117]);
  });

  it("rejects factors that return non-integers", () => {
    const broken: DecisionFactor = { id: "broken", score: () => 0.5 };
    expect(() => scoreCandidates([candidate("a", 1)], [broken], context)).toThrow(BehaviorError);
  });
});

describe("chooseAction", () => {
  it("returns null without candidates", () => {
    expect(chooseAction([], [plusTen], context)).toBeNull();
  });

  it("picks the highest score", () => {
    expect(chooseAction([candidate("b", 10), candidate("a", 50)], [], context)?.id).toBe("a");
    expect(chooseAction([candidate("a", 50), candidate("b", 10)], [plusTen], context)?.id).toBe(
      "a",
    );
  });

  it("lets a registered factor change the decision (spec 013 SC-011)", () => {
    const candidates = [candidate("a", 50), candidate("b", 10)];
    expect(chooseAction(candidates, [], context)?.id).toBe("a");
    expect(chooseAction(candidates, [favourB], context)?.id).toBe("b");
  });

  it("breaks ties by the lowest candidate id, whatever the order", () => {
    expect(chooseAction([candidate("rest", 5), candidate("hunger", 5)], [], context)?.id).toBe(
      "hunger",
    );
    expect(chooseAction([candidate("hunger", 5), candidate("rest", 5)], [], context)?.id).toBe(
      "hunger",
    );
  });

  it("is deterministic: the same input gives the same output every time", () => {
    const candidates = [candidate("c", 3), candidate("a", 3), candidate("b", 3)];
    const results = Array.from(
      { length: 20 },
      () => chooseAction(candidates, [plusTen], context)?.id,
    );
    expect(new Set(results)).toEqual(new Set(["a"]));
  });
});
