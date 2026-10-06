/**
 * The band a standing value falls into (spec 021 FR-008, DECISIONS D-56): the derived "disposition"
 * of one faction toward another. `Hostile` is the hostile gate (value below `hostileStanding`);
 * `Friendly` starts at the trade-agreement threshold. Never stored.
 */
export enum Attitude {
  Hostile = "hostile",
  Wary = "wary",
  Neutral = "neutral",
  Friendly = "friendly",
  Allied = "allied",
}

/**
 * The attitude bands in ascending order.
 */
export const attitudeOrder: readonly Attitude[] = [
  Attitude.Hostile,
  Attitude.Wary,
  Attitude.Neutral,
  Attitude.Friendly,
  Attitude.Allied,
];

/**
 * The thresholds of the bands, content constants.
 */
export type AttitudeThresholds = {
  hostileStanding: number;
  friendlyStanding: number;
  alliedStanding: number;
};

/**
 * The band of a standing value: below `hostileStanding` (-30) Hostile, below 0 Wary, below
 * `friendlyStanding` (20) Neutral, below `alliedStanding` (70) Friendly, else Allied.
 *
 * @param thresholds - The content constants that set the bands.
 * @param value - A standing value.
 * @returns The band.
 */
export function attitudeOfValue(thresholds: AttitudeThresholds, value: number): Attitude {
  if (value < thresholds.hostileStanding) {
    return Attitude.Hostile;
  }
  if (value < 0) {
    return Attitude.Wary;
  }
  if (value < thresholds.friendlyStanding) {
    return Attitude.Neutral;
  }
  return value < thresholds.alliedStanding ? Attitude.Friendly : Attitude.Allied;
}
