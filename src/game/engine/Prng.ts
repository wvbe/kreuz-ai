/**
 * Deterministic PCG32 (XSH-RR) pseudo random number generation with named, persisted streams
 * (spec 011, DECISIONS AD6). All arithmetic is exact integer math on 32-bit halves, so results
 * are bit-identical on every platform and nothing here touches Math.random or the clock.
 */

/**
 * A 64-bit unsigned integer as `[high, low]` uint32 words (JSON cannot hold 64-bit numbers).
 */
export type Uint64Words = [number, number];

/**
 * Serialized state of one stream: PCG32 `state` and odd `inc`, both as uint32 pairs.
 */
export type PrngStreamState = {
  state: Uint64Words;
  inc: Uint64Words;
};

/**
 * Serialized state of the whole generator: the recorded seed plus every named stream.
 */
export type PrngState = {
  seed: number;
  streams: Record<string, PrngStreamState>;
};

/**
 * Options for {@link Prng.create}.
 */
export type PrngCreateOptions = {
  /**
   * Explicit seed (integer 0..2^32-1). When omitted, `entropy` is called exactly once.
   */
  seed?: number;
  /**
   * Injected entropy source returning a uint32; the only permitted non-deterministic input.
   */
  entropy?: () => number;
};

/**
 * Thrown for invalid seeds, arguments, or corrupt serialized state.
 */
export class PrngError extends Error {
  /**
   * Creates a PRNG validation error.
   *
   * @param message - Human readable description of what was rejected.
   */
  constructor(message: string) {
    super(message);
    this.name = "PrngError";
  }
}

const twoPow32 = 0x100000000;
const multiplierHigh = 0x5851f42d;
const multiplierLow = 0x4c957f2d;
const goldenRatio32 = 0x9e3779b9;

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < twoPow32;
}

/**
 * Multiplies two uint32 values into a 64-bit `[high, low]` pair without precision loss.
 *
 * @param left - First uint32 factor.
 * @param right - Second uint32 factor.
 * @returns The 64-bit product as `[high, low]` words.
 */
function mul32(left: number, right: number): Uint64Words {
  const leftLow = left & 0xffff;
  const leftHigh = left >>> 16;
  const rightLow = right & 0xffff;
  const rightHigh = right >>> 16;
  const middle = leftLow * rightHigh + leftHigh * rightLow;
  const lowSum = leftLow * rightLow + (middle % 0x10000) * 0x10000;
  const carry = Math.floor(lowSum / twoPow32);
  const high = leftHigh * rightHigh + Math.floor(middle / 0x10000) + carry;
  return [high % twoPow32, lowSum % twoPow32];
}

function mul64Words(left: Uint64Words, high: number, low: number): Uint64Words {
  const [productHigh, productLow] = mul32(left[1], low);
  const crossHigh = (Math.imul(left[0], low) + Math.imul(left[1], high)) >>> 0;
  return [(productHigh + crossHigh) >>> 0, productLow];
}

function add64Words(left: Uint64Words, right: Uint64Words): Uint64Words {
  const low = left[1] + right[1];
  const carry = low >= twoPow32 ? 1 : 0;
  return [(left[0] + right[0] + carry) >>> 0, low >>> 0];
}

function fmix32(input: number): number {
  let value = input >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    hash ^= text.charCodeAt(cursor);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function validateWords(words: Uint64Words, label: string): void {
  if (!Array.isArray(words) || words.length !== 2 || !isUint32(words[0]) || !isUint32(words[1])) {
    throw new PrngError(`${label} must be two uint32 words`);
  }
}

function validateSeed(seed: number): void {
  if (!isUint32(seed)) {
    throw new PrngError(`seed must be an integer in 0..4294967295, got ${String(seed)}`);
  }
}

/**
 * Validates a serialized stream state (shape, uint32 words, odd increment).
 *
 * @param state - The state to check.
 * @param label - Name used in error messages.
 */
function validateStreamState(state: PrngStreamState, label: string): void {
  validateWords(state.state, `${label}.state`);
  validateWords(state.inc, `${label}.inc`);
  if ((state.inc[1] & 1) !== 1) {
    throw new PrngError(`${label}.inc must be odd`);
  }
}

/**
 * One independent PCG32 sequence with integer-only gameplay helpers.
 */
export class PrngStream {
  private stateWords: Uint64Words;
  private incWords: Uint64Words;

  /**
   * Restores a stream from serialized state, validating it.
   *
   * @param snapshot - State previously returned by {@link PrngStream.serialize}.
   */
  constructor(snapshot: PrngStreamState) {
    validateStreamState(snapshot, "stream");
    this.stateWords = [snapshot.state[0], snapshot.state[1]];
    this.incWords = [snapshot.inc[0], snapshot.inc[1]];
  }

  /**
   * Builds a stream with the reference `pcg32_srandom_r(initState, initSeq)` seeding.
   *
   * @param initState - Initial state as `[high, low]` uint32 words.
   * @param initSeq - Stream selector as `[high, low]` uint32 words.
   * @returns A freshly seeded stream.
   */
  static fromInit(initState: Uint64Words, initSeq: Uint64Words): PrngStream {
    validateWords(initState, "initState");
    validateWords(initSeq, "initSeq");
    const inc: Uint64Words = [
      ((initSeq[0] << 1) | (initSeq[1] >>> 31)) >>> 0,
      ((initSeq[1] << 1) | 1) >>> 0,
    ];
    const stream = new PrngStream({ state: [0, 0], inc });
    stream.advance();
    stream.stateWords = add64Words(stream.stateWords, initState);
    stream.advance();
    return stream;
  }

  /**
   * Builds the stream a root seed assigns to `name`. Depends only on `(seed, name)`, never on
   * how far any other stream has advanced.
   *
   * @param seed - Root seed, integer 0..2^32-1.
   * @param name - Stream name.
   * @returns A freshly seeded stream.
   */
  static forName(seed: number, name: string): PrngStream {
    validateSeed(seed);
    const nameHash = fnv1a32(name);
    const word0 = fmix32((seed ^ nameHash) >>> 0);
    const word1 = fmix32((word0 + goldenRatio32) >>> 0);
    const word2 = fmix32((word1 ^ nameHash) >>> 0);
    const word3 = fmix32((word2 + goldenRatio32) >>> 0);
    return PrngStream.fromInit([word0, word1], [word2, word3]);
  }

  private advance(): void {
    this.stateWords = add64Words(
      mul64Words(this.stateWords, multiplierHigh, multiplierLow),
      this.incWords,
    );
  }

  /**
   * Returns the next uniformly distributed uint32.
   *
   * @returns Integer in 0..4294967295.
   */
  nextU32(): number {
    const [high, low] = this.stateWords;
    this.advance();
    const shiftedLow = ((high << 14) | (low >>> 18)) >>> 0;
    const shiftedHigh = high >>> 18;
    const mixedHigh = (high ^ shiftedHigh) >>> 0;
    const mixedLow = (low ^ shiftedLow) >>> 0;
    const xorShifted = ((mixedHigh << 5) | (mixedLow >>> 27)) >>> 0;
    const rotation = high >>> 27;
    return ((xorShifted >>> rotation) | (xorShifted << (-rotation & 31))) >>> 0;
  }

  /**
   * Returns an unbiased integer in `0..range-1`.
   *
   * @param range - Integer in 1..2^32.
   * @returns Integer below `range`.
   */
  nextBelow(range: number): number {
    if (!Number.isInteger(range) || range < 1 || range > twoPow32) {
      throw new PrngError(`range must be an integer in 1..4294967296, got ${String(range)}`);
    }
    if (range === twoPow32) {
      return this.nextU32();
    }
    const threshold = (twoPow32 - range) % range;
    for (;;) {
      const draw = this.nextU32();
      if (draw >= threshold) {
        return draw % range;
      }
    }
  }

  /**
   * Returns an unbiased integer in `min..max`, both inclusive.
   *
   * @param min - Lowest value, integer.
   * @param max - Highest value, integer, at least `min`, with `max - min < 2^32`.
   * @returns Integer in the closed range.
   */
  nextInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new PrngError(`nextInt bounds must be integers, got ${String(min)}, ${String(max)}`);
    }
    if (max < min) {
      throw new PrngError(`nextInt max (${max}) must not be below min (${min})`);
    }
    return min + this.nextBelow(max - min + 1);
  }

  /**
   * Returns true with the given probability in thousandths (integer, no floats).
   *
   * @param permille - Integer 0..1000; 0 never succeeds, 1000 always does.
   * @returns Whether the roll succeeded.
   */
  chancePermille(permille: number): boolean {
    if (!Number.isInteger(permille) || permille < 0 || permille > 1000) {
      throw new PrngError(`permille must be an integer in 0..1000, got ${String(permille)}`);
    }
    return this.nextBelow(1000) < permille;
  }

  /**
   * Picks one element uniformly.
   *
   * @param items - Non-empty array.
   * @returns A member of `items`.
   */
  choice<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new PrngError("choice requires a non-empty array");
    }
    return items[this.nextBelow(items.length)] as T;
  }

  /**
   * Picks one option with probability proportional to its positive integer weight.
   *
   * @param options - Non-empty array of options.
   * @param weights - One positive integer weight per option; the sum must not exceed 2^32.
   * @returns The chosen option.
   */
  weighted<T>(options: readonly T[], weights: readonly number[]): T {
    if (options.length === 0) {
      throw new PrngError("weighted requires at least one option");
    }
    if (weights.length !== options.length) {
      throw new PrngError("weighted requires exactly one weight per option");
    }
    let total = 0;
    for (const weight of weights) {
      if (!Number.isInteger(weight) || weight <= 0) {
        throw new PrngError(`weights must be positive integers, got ${String(weight)}`);
      }
      total += weight;
    }
    if (total > twoPow32) {
      throw new PrngError("weights must sum to at most 4294967296");
    }
    let remaining = this.nextBelow(total);
    for (let cursor = 0; cursor < options.length; cursor += 1) {
      remaining -= weights[cursor] as number;
      if (remaining < 0) {
        return options[cursor] as T;
      }
    }
    throw new PrngError("weighted selection fell through");
  }

  /**
   * Shuffles an array in place (Fisher-Yates).
   *
   * @param items - The array to permute.
   */
  shuffle<T>(items: T[]): void {
    for (let cursor = items.length - 1; cursor > 0; cursor -= 1) {
      const target = this.nextBelow(cursor + 1);
      const held = items[cursor] as T;
      items[cursor] = items[target] as T;
      items[target] = held;
    }
  }

  /**
   * Snapshots the stream for JSON serialization.
   *
   * @returns A deep copy of the internal state.
   */
  serialize(): PrngStreamState {
    return {
      state: [this.stateWords[0], this.stateWords[1]],
      inc: [this.incWords[0], this.incWords[1]],
    };
  }

  /**
   * Overwrites this stream's state in place (used by restore and re-seeding).
   *
   * @param snapshot - Valid serialized stream state.
   */
  loadState(snapshot: PrngStreamState): void {
    validateStreamState(snapshot, "stream");
    this.stateWords = [snapshot.state[0], snapshot.state[1]];
    this.incWords = [snapshot.inc[0], snapshot.inc[1]];
  }
}

/**
 * Root generator: records the seed once and hands out named, persisted {@link PrngStream}s.
 */
export class Prng {
  private rootSeed: number;
  private readonly streams = new Map<string, PrngStream>();

  private constructor(seed: number) {
    validateSeed(seed);
    this.rootSeed = seed;
  }

  /**
   * Creates a generator from an explicit seed, or from injected entropy exactly once.
   *
   * @param options - Seed and/or entropy source; a missing seed requires `entropy`.
   * @returns The generator; read back the recorded seed with {@link Prng.seed}.
   */
  static create(options: PrngCreateOptions): Prng {
    if (options.seed !== undefined) {
      return new Prng(options.seed);
    }
    if (!options.entropy) {
      throw new PrngError("a seed or an entropy source is required");
    }
    return new Prng(options.entropy());
  }

  /**
   * Restores a generator and all of its streams from serialized state.
   *
   * @param state - State previously returned by {@link Prng.serialize}.
   * @returns A generator that continues each stream exactly where it stopped.
   */
  static fromState(state: PrngState): Prng {
    const prng = new Prng(state.seed);
    for (const [name, snapshot] of Object.entries(state.streams)) {
      validateStreamState(snapshot, `streams.${name}`);
      prng.streams.set(name, new PrngStream(snapshot));
    }
    return prng;
  }

  /**
   * The recorded root seed.
   *
   * @returns Integer 0..2^32-1.
   */
  get seed(): number {
    return this.rootSeed;
  }

  /**
   * Gets (creating on first use) the persisted stream called `name`. The same name always
   * returns the same live object, and a new stream depends only on `(seed, name)`.
   *
   * @param name - Non-empty stream name such as `"identity.names"`.
   * @returns The stream.
   */
  stream(name: string): PrngStream {
    if (name.length === 0) {
      throw new PrngError("stream name must not be empty");
    }
    let existing = this.streams.get(name);
    if (!existing) {
      existing = PrngStream.forName(this.rootSeed, name);
      this.streams.set(name, existing);
    }
    return existing;
  }

  /**
   * Re-seeds every stream in place. Tests and debug tooling only (Constitution II).
   *
   * @param seed - New root seed, integer 0..2^32-1.
   */
  setSeed(seed: number): void {
    validateSeed(seed);
    this.rootSeed = seed;
    for (const [name, existing] of this.streams) {
      existing.loadState(PrngStream.forName(seed, name).serialize());
    }
  }

  /**
   * Snapshots the seed and all streams, ordered by name, for JSON serialization.
   *
   * @returns Plain JSON-safe state.
   */
  serialize(): PrngState {
    const streams: Record<string, PrngStreamState> = {};
    for (const name of [...this.streams.keys()].sort()) {
      streams[name] = (this.streams.get(name) as PrngStream).serialize();
    }
    return { seed: this.rootSeed, streams };
  }
}
