import { describe, expect, it } from "vitest";
import { compareClaimCandidates, sortClaimCandidates } from "./claimOrder";
import type { ClaimCandidate } from "./claimOrder";

function candidate(postingId: number, overrides: Partial<ClaimCandidate> = {}): ClaimCandidate {
  return {
    postingId,
    boardId: 2,
    priority: 50,
    urgent: false,
    familiarity: 0,
    pathCost: 100,
    ...overrides,
  };
}

function order(candidates: ClaimCandidate[]): number[] {
  return sortClaimCandidates(candidates).map((entry) => entry.postingId);
}

// @covers 017:FR-007 017:SC-004
describe("compareClaimCandidates", () => {
  it("orders by priority first, even against urgency, familiarity and distance", () => {
    expect(
      order([
        candidate(1, { urgent: true, familiarity: 10, pathCost: 1 }),
        candidate(2, { priority: 60, pathCost: 900 }),
      ]),
    ).toEqual([2, 1]);
  });

  it("then urgent before not urgent, whatever the familiarity and distance", () => {
    expect(order([candidate(1, { familiarity: 9 }), candidate(2, { urgent: true })])).toEqual([
      2, 1,
    ]);
  });

  it("then the higher familiarity bucket, whatever the distance", () => {
    expect(
      order([candidate(1, { pathCost: 1 }), candidate(2, { familiarity: 3, pathCost: 500 })]),
    ).toEqual([2, 1]);
  });

  it("then the shorter path", () => {
    expect(order([candidate(1, { pathCost: 80 }), candidate(2, { pathCost: 40 })])).toEqual([2, 1]);
  });

  it("then the lowest posting id, so the order is total without randomness", () => {
    expect(order([candidate(7), candidate(3), candidate(5)])).toEqual([3, 5, 7]);
    expect(compareClaimCandidates(candidate(3), candidate(3))).toBe(0);
    expect(compareClaimCandidates(candidate(3), candidate(4))).toBeLessThan(0);
  });

  it("does not change its input", () => {
    const input = [candidate(2), candidate(1)];
    sortClaimCandidates(input);
    expect(input.map((entry) => entry.postingId)).toEqual([2, 1]);
  });
});
