import { z } from "zod";
import { SettlementTier } from "../content/contentTypes";
import { MapSize } from "../map/mapSize";
import { Difficulty } from "../save/initOptions";
import { InvalidOptionsError } from "./InvalidOptionsError";

/**
 * Options of `GameEngine.newGame` (spec 007 FR-007, DECISIONS D-06). Every field is optional;
 * unknown fields are ignored and reported back as `ignoredFields`.
 */
export type GameInitOptions = {
  /**
   * Default {@link Difficulty.Steady}.
   */
  difficulty?: Difficulty;
  /**
   * Default {@link SettlementTier.Hamlet} (spec 027 FR-022).
   */
  startingTier?: SettlementTier;
  /**
   * When given, bootstrap creates the starting map of that size; without it there is no map.
   */
  mapSize?: MapSize;
  /**
   * Integer 0..2^32-1. When absent the engine draws one from its entropy source, exactly once.
   */
  seed?: number;
};

/**
 * Options after validation and defaulting.
 */
export type ParsedInitOptions = {
  difficulty: Difficulty;
  startingTier: SettlementTier;
  mapSize: MapSize | null;
  /**
   * Null when the caller gave none and one has to be generated.
   */
  seed: number | null;
  /**
   * Names of fields that are not part of {@link GameInitOptions} (typos show up here).
   */
  ignoredFields: string[];
};

/**
 * Default difficulty (spec 027).
 */
export const defaultDifficulty = Difficulty.Steady;

/**
 * Default starting tier (spec 027 FR-022).
 */
export const defaultStartingTier = SettlementTier.Hamlet;

/**
 * Largest valid seed.
 */
export const maxSeed = 0xffffffff;

const knownFields: readonly string[] = ["difficulty", "startingTier", "mapSize", "seed"];

const difficultySchema = z.enum(Difficulty);
const startingTierSchema = z.enum(SettlementTier);
const mapSizeSchema = z.enum(MapSize);
const seedSchema = z.number().int().min(0).max(maxSeed);

function describeValue(value: object | string | number | boolean | null | undefined): string {
  if (typeof value === "string") {
    return `'${value}'`;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  if (value === undefined) {
    return "undefined";
  }
  return JSON.stringify(value);
}

function isPlainRecord(
  // eslint-disable-next-line no-restricted-syntax -- options arrive untyped from the host (spec 007 US4)
  value: unknown,
): value is { [key: string]: object | string | number | boolean | null | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates `newGame` options before anything is created (spec 007 FR-010, SC-002) and applies
 * the defaults. All problems are collected into one {@link InvalidOptionsError}; the message of a
 * single problem has the form `Invalid difficulty: 'super-hard'. Valid values: peaceful, steady,
 * harsh.` Unknown fields are ignored for forward compatibility and listed in `ignoredFields`.
 *
 * @param input - Whatever the host passed (typed callers pass {@link GameInitOptions}).
 * @returns The validated, defaulted options.
 */
export function parseGameInitOptions(
  // eslint-disable-next-line no-restricted-syntax -- options arrive untyped from the host (spec 007 US4)
  input: unknown,
): ParsedInitOptions {
  if (input === undefined) {
    return {
      difficulty: defaultDifficulty,
      startingTier: defaultStartingTier,
      mapSize: null,
      seed: null,
      ignoredFields: [],
    };
  }
  if (!isPlainRecord(input)) {
    throw new InvalidOptionsError(["Invalid options: expected an object."]);
  }
  const issues: string[] = [];
  const present = (name: string): boolean =>
    Object.hasOwn(input, name) && input[name] !== undefined;

  let difficulty = defaultDifficulty;
  if (present("difficulty")) {
    const parsed = difficultySchema.safeParse(input["difficulty"]);
    if (parsed.success) {
      difficulty = parsed.data;
    } else {
      issues.push(
        `Invalid difficulty: ${describeValue(input["difficulty"])}. Valid values: ${Object.values(Difficulty).join(", ")}.`,
      );
    }
  }
  let startingTier = defaultStartingTier;
  if (present("startingTier")) {
    const parsed = startingTierSchema.safeParse(input["startingTier"]);
    if (parsed.success) {
      startingTier = parsed.data;
    } else {
      issues.push(
        `Invalid startingTier: ${describeValue(input["startingTier"])}. Valid values: ${Object.values(SettlementTier).join(", ")}.`,
      );
    }
  }
  let mapSize: MapSize | null = null;
  if (present("mapSize")) {
    const parsed = mapSizeSchema.safeParse(input["mapSize"]);
    if (parsed.success) {
      mapSize = parsed.data;
    } else {
      const sizes = [MapSize.Small, MapSize.Medium, MapSize.Large]
        .map((size) => `${size} (${MapSize[size]?.toLowerCase()})`)
        .join(", ");
      issues.push(`Invalid mapSize: ${describeValue(input["mapSize"])}. Valid values: ${sizes}.`);
    }
  }
  let seed: number | null = null;
  if (present("seed")) {
    const parsed = seedSchema.safeParse(input["seed"]);
    if (parsed.success) {
      seed = parsed.data;
    } else {
      issues.push(
        `Invalid seed: ${describeValue(input["seed"])}. Must be an integer from 0 to ${maxSeed}.`,
      );
    }
  }
  if (issues.length > 0) {
    throw new InvalidOptionsError(issues);
  }
  return {
    difficulty,
    startingTier,
    mapSize,
    seed,
    ignoredFields: Object.keys(input)
      .filter((name) => !knownFields.includes(name))
      .sort(),
  };
}
