/**
 * What the claim order looks at for one posting a worker could take.
 */
export type ClaimCandidate = {
  postingId: number;
  boardId: number;
  /**
   * Posting priority `0..100`, higher first.
   */
  priority: number;
  /**
   * Urgent postings first.
   */
  urgent: boolean;
  /**
   * `floor(skill level / 10)` of the job type's skill, `0..10`, higher first.
   */
  familiarity: number;
  /**
   * Path cost from the worker to the target, lower first.
   */
  pathCost: number;
};

/**
 * The claim order (DECISIONS D-08, amending 017 FR-007): priority descending, then urgent first,
 * then familiarity bucket descending, then path cost ascending, then posting id ascending. Each
 * key only decides when all earlier keys are equal. The posting id makes the order total, so no
 * random tie-break exists or is needed.
 *
 * @param left - First candidate.
 * @param right - Second candidate.
 * @returns Negative when `left` goes first, positive when `right` does, never 0 for two
 * different postings.
 */
export function compareClaimCandidates(left: ClaimCandidate, right: ClaimCandidate): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  if (left.urgent !== right.urgent) {
    return left.urgent ? -1 : 1;
  }
  if (left.familiarity !== right.familiarity) {
    return right.familiarity - left.familiarity;
  }
  if (left.pathCost !== right.pathCost) {
    return left.pathCost - right.pathCost;
  }
  return left.postingId - right.postingId;
}

/**
 * Sorts candidates by {@link compareClaimCandidates}.
 *
 * @param candidates - Candidates in any order.
 * @returns A new array, best first.
 */
export function sortClaimCandidates(candidates: readonly ClaimCandidate[]): ClaimCandidate[] {
  return [...candidates].sort(compareClaimCandidates);
}
