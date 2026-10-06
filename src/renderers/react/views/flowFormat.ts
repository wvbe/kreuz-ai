import type { FlowParty, FlowRow } from "../../../game/status/statusTypes";

/**
 * Formats a per-day amount stored times 1000 (`1500` is `1.5`), one decimal, with a sign for
 * negatives.
 *
 * @param milli - The amount x 1000.
 * @returns For example `-2.5`.
 */
export function formatPerDay(milli: number): string {
  const sign = milli < 0 ? "-" : "";
  const abs = Math.abs(milli);
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000)
    .padStart(3, "0")
    .slice(0, 1)}`;
}

/**
 * Direction of a material's daily net over the window.
 */
export enum TrendDirection {
  Up = "up",
  Down = "down",
  Flat = "flat",
}

/**
 * The trend of a row: the last day's net against the day before (flat with fewer than two days).
 *
 * @param trend - The daily nets, oldest first.
 * @returns The direction.
 */
export function trendDirection(trend: readonly number[]): TrendDirection {
  const last = trend[trend.length - 1];
  const before = trend[trend.length - 2];
  if (last === undefined || before === undefined || last === before) {
    return TrendDirection.Flat;
  }
  return last > before ? TrendDirection.Up : TrendDirection.Down;
}

/**
 * The arrow glyph of a trend.
 *
 * @param direction - The direction.
 * @returns An arrow.
 */
export function trendArrow(direction: TrendDirection): string {
  if (direction === TrendDirection.Up) {
    return "↑";
  }
  return direction === TrendDirection.Down ? "↓" : "→";
}

/**
 * Orders flow rows with the largest deficit (most negative net per day) first; ties by material.
 *
 * @param rows - The rows of the `flow` query.
 * @returns A sorted copy.
 */
export function sortByDeficit(rows: readonly FlowRow[]): FlowRow[] {
  return [...rows].sort(
    (left, right) =>
      left.netPerDayMilli - right.netPerDayMilli || left.materialId.localeCompare(right.materialId),
  );
}

/**
 * Total quantity per source of a list of producers or consumers (the FlowSource attribution).
 *
 * @param parties - Producers or consumers of a row.
 * @returns Source and quantity, the largest first.
 */
export function sumBySource(parties: readonly FlowParty[]): { source: string; quantity: number }[] {
  const totals = new Map<string, number>();
  for (const party of parties) {
    totals.set(party.source, (totals.get(party.source) ?? 0) + party.quantity);
  }
  return [...totals.entries()]
    .map(([source, quantity]) => ({ source, quantity }))
    .sort(
      (left, right) => right.quantity - left.quantity || left.source.localeCompare(right.source),
    );
}
