/**
 * Seeded pseudo-random number generator using Mulberry32 algorithm.
 * Provides deterministic randomness for reproducible game simulation.
 */
export type PrngState = {
  seed: number;
  state: number;
};

/**
 * Creates a new PRNG state from a seed.
 */
export function createPrng(seed: number): PrngState {
  return { seed, state: seed };
}

/**
 * Generates the next random number in [0, 1) and returns updated state.
 */
export function nextRandom(prng: PrngState): { value: number; prng: PrngState } {
  let state = prng.state + 0x6d2b79f5;
  state = Math.imul(state ^ (state >>> 15), state | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  const result = ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  return { value: result, prng: { seed: prng.seed, state } };
}

/**
 * Generates a random integer in [min, max] inclusive.
 */
export function randomInt(
  prng: PrngState,
  min: number,
  max: number,
): { value: number; prng: PrngState } {
  const { value, prng: next } = nextRandom(prng);
  return { value: Math.floor(value * (max - min + 1)) + min, prng: next };
}

/**
 * Generates a random float in [min, max).
 */
export function randomFloat(
  prng: PrngState,
  min: number,
  max: number,
): { value: number; prng: PrngState } {
  const { value, prng: next } = nextRandom(prng);
  return { value: value * (max - min) + min, prng: next };
}

/**
 * Shuffles an array using Fisher-Yates, returning a new shuffled array and updated PRNG.
 */
export function shuffle<T>(prng: PrngState, array: readonly T[]): { value: T[]; prng: PrngState } {
  const result = [...array];
  let current = prng;
  for (let index = result.length - 1; index > 0; index--) {
    const { value: randomIndex, prng: next } = randomInt(current, 0, index);
    current = next;
    [result[index], result[randomIndex]] = [result[randomIndex]!, result[index]!];
  }
  return { value: result, prng: current };
}

/**
 * Picks a random element from an array.
 */
export function pickRandom<T>(
  prng: PrngState,
  array: readonly T[],
): { value: T; prng: PrngState } {
  const { value: index, prng: next } = randomInt(prng, 0, array.length - 1);
  return { value: array[index]!, prng: next };
}
