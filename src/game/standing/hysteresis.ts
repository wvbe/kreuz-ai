/**
 * What the hysteresis step noticed.
 */
export enum HysteresisEvent {
  None = "none",
  /**
   * The stock fell to the threshold: restocking begins.
   */
  Started = "started",
  /**
   * The stock reached the target: restocking is over.
   */
  Satisfied = "satisfied",
}

/**
 * The result of one hysteresis step.
 */
export type HysteresisStep = {
  restocking: boolean;
  event: HysteresisEvent;
};

/**
 * Steps the restock hysteresis of spec 026 FR-010 (1) and (2): a satisfied order starts
 * restocking when the stock is at or below the threshold, a restocking order is satisfied when
 * the stock reaches the target; in between nothing changes, so the order does not flutter around
 * the target. Pure.
 *
 * @param restocking - The saved hysteresis bit.
 * @param stock - The counted stock.
 * @param target - Target quantity.
 * @param threshold - Restock threshold (below the target).
 * @returns The new bit and what happened.
 */
export function stepHysteresis(
  restocking: boolean,
  stock: number,
  target: number,
  threshold: number,
): HysteresisStep {
  if (!restocking && stock <= threshold) {
    return { restocking: true, event: HysteresisEvent.Started };
  }
  if (restocking && stock >= target) {
    return { restocking: false, event: HysteresisEvent.Satisfied };
  }
  return { restocking, event: HysteresisEvent.None };
}

/**
 * How many runs an order wants in flight (spec 026 FR-010 (3)): none unless restocking, then as
 * many as the deficit needs (`ceil((target - stock) / outputPerRun)`) but at most
 * `maxOpenRunsPerOrder`. Runs that are claimed or running count as owned but their output is not
 * in the stock yet, so the deficit is the whole gap (the run cap is what bounds the overshoot).
 *
 * @param restocking - The hysteresis bit after the step.
 * @param stock - The counted stock.
 * @param target - Target quantity.
 * @param outputPerRun - Units of the material one run makes.
 * @param maxRuns - `maxOpenRunsPerOrder`.
 * @returns The wanted number of owned runs, at least 0.
 */
export function desiredRuns(
  restocking: boolean,
  stock: number,
  target: number,
  outputPerRun: number,
  maxRuns: number,
): number {
  if (!restocking) {
    return 0;
  }
  const deficit = Math.max(0, target - stock);
  return Math.min(maxRuns, Math.ceil(deficit / outputPerRun));
}
