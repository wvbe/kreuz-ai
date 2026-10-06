/**
 * The result of one day's accumulator step for one supplied-good group.
 */
export type SupplyOutcome = {
  /**
   * Whole units the day needs: `floor((accumulator + demand) / 1000)`.
   */
  needed: number;
  /**
   * Units that leave storage (all `needed`, or 0 when storage holds fewer).
   */
  consumed: number;
  /**
   * The accumulator after the step, in milli-units.
   */
  accumulator: number;
  /**
   * The group's requirement holds today.
   */
  met: boolean;
};

/**
 * The accumulator model of spec 029 FR-009: the day's demand (`residents x perResidentPerDay`,
 * milli-units) is added to the accumulator and `floor(accumulator / 1000)` whole units are due.
 * When storage holds all of them they are consumed and `1000 x units` leaves the accumulator
 * (met). Otherwise nothing is consumed and the whole units that stay owed are capped at one day's
 * worth (`ceil(demand / 1000)` units; the fraction of a unit is kept), so unmet demand never piles
 * up beyond one day (unmet; DECISIONS D-58 reads the spec's "capped at `1000 x units`" this way,
 * taken literally the debt would grow every day). A day that owes no whole unit is met without
 * consuming anything.
 *
 * @param accumulator - Milli-units carried over from earlier days.
 * @param demandMilli - Today's demand in milli-units.
 * @param inStock - Units of the group in the household's storage.
 * @returns The units due and consumed, the new accumulator and whether the group is met.
 */
export function supplyOutcome(
  accumulator: number,
  demandMilli: number,
  inStock: number,
): SupplyOutcome {
  const total = accumulator + demandMilli;
  const needed = Math.floor(total / 1000);
  if (inStock >= needed) {
    return { needed, consumed: needed, accumulator: total - 1000 * needed, met: true };
  }
  const dayUnits = Math.max(1, Math.ceil(demandMilli / 1000));
  return {
    needed,
    consumed: 0,
    accumulator: Math.min(total, 1000 * dayUnits + (total % 1000)),
    met: false,
  };
}
