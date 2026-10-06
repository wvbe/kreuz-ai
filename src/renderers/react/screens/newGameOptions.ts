/**
 * One choice of a new-game select or radio group.
 */
export type NewGameChoice = {
  value: string;
  label: string;
  /**
   * One-line description (spec 024 FR-037, spec 027 FR-013).
   */
  description: string;
};

/**
 * The difficulties of spec 027, Steady being the default.
 */
export const difficultyChoices: readonly NewGameChoice[] = [
  {
    value: "peaceful",
    label: "Peaceful",
    description:
      "Cosy: food keeps longer, settlers stay content and neighbours seldom turn hostile.",
  },
  {
    value: "steady",
    label: "Steady",
    description: "Balanced: the standard pace of spoilage, needs and neighbourly trust.",
  },
  {
    value: "harsh",
    label: "Harsh",
    description: "Hard: food spoils faster, needs press harder and neighbours turn hostile sooner.",
  },
];

/**
 * The starting-map sizes (the engine's 0, 1 and 2).
 */
export const mapSizeChoices: readonly NewGameChoice[] = [
  { value: "0", label: "Small", description: "600 cells" },
  { value: "1", label: "Medium", description: "1200 cells" },
  { value: "2", label: "Large", description: "2400 cells" },
];

/**
 * The starting tiers of spec 027.
 */
export const tierChoices: readonly NewGameChoice[] = [
  { value: "hamlet", label: "Hamlet", description: "The default start." },
  { value: "village", label: "Village", description: "More of the catalogue unlocked." },
  { value: "market_town", label: "Market town", description: "Most of the catalogue unlocked." },
  { value: "chartered_town", label: "Chartered town", description: "Everything unlocked." },
];

/**
 * The default difficulty.
 */
export const defaultDifficulty = "steady";

/**
 * Highest seed the engine accepts.
 */
export const maxSeed = 4_294_967_295;

/**
 * Parses the seed field.
 *
 * @param text - What the player typed.
 * @returns The seed, or null when it is not an integer from 0 to 4294967295.
 */
export function parseSeed(text: string): number | null {
  if (!/^\d{1,10}$/.test(text.trim())) {
    return null;
  }
  const seed = Number(text.trim());
  return seed <= maxSeed ? seed : null;
}

/**
 * Draws a seed from a source of numbers in `[0, 1)` (the browser's `Math.random`; the seed then
 * fixes the whole game, so this is the only place randomness enters).
 *
 * @param random - The source.
 * @returns A seed.
 */
export function randomSeed(random: () => number): number {
  return Math.floor(random() * (maxSeed + 1));
}
