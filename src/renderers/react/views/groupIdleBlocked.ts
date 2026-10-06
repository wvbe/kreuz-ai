import type { IdleBlockedRow } from "../../../game/status/statusTypes";

/**
 * Rows of the Idle and Blocked list that share a primary reason kind.
 */
export type IdleBlockedGroup = {
  kind: string;
  rows: IdleBlockedRow[];
};

/**
 * Groups the rows of the `idle-blocked` query by their primary reason kind (spec 024 FR-026). Rows
 * inside a group are ordered by `sinceTick` (oldest stall first, then by subject id); groups are
 * ordered by their oldest row, so the longest-standing problem is on top.
 *
 * @param rows - The rows of the query.
 * @returns The groups; empty for no rows.
 */
export function groupIdleBlocked(rows: readonly IdleBlockedRow[]): IdleBlockedGroup[] {
  const groups = new Map<string, IdleBlockedRow[]>();
  for (const row of rows) {
    const kind = row.reasons[0]?.kind ?? "Unexplained";
    groups.set(kind, [...(groups.get(kind) ?? []), row]);
  }
  const ordered = [...groups.entries()].map(([kind, members]) => ({
    kind,
    rows: [...members].sort(
      (left, right) => left.sinceTick - right.sinceTick || left.subject.id - right.subject.id,
    ),
  }));
  return ordered.sort(
    (left, right) =>
      (left.rows[0]?.sinceTick ?? 0) - (right.rows[0]?.sinceTick ?? 0) ||
      left.kind.localeCompare(right.kind),
  );
}
