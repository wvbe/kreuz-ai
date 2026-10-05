import { describe, expect, it } from "vitest";
import { SettlementTier } from "../content/contentTypes";
import { MapSize } from "../map/mapSize";
import { Difficulty } from "../save/initOptions";
import { InvalidOptionsError } from "./InvalidOptionsError";
import { defaultDifficulty, defaultStartingTier, maxSeed, parseGameInitOptions } from "./options";
import type { GameInitOptions } from "./options";

function parseUntyped(json: string): ReturnType<typeof parseGameInitOptions> {
  return parseGameInitOptions(JSON.parse(json));
}

function messageOf(json: string): string {
  try {
    parseUntyped(json);
  } catch (error) {
    if (error instanceof InvalidOptionsError) {
      return error.message;
    }
    throw error;
  }
  return "";
}

describe("parseGameInitOptions", () => {
  it("applies the defaults", () => {
    expect(parseGameInitOptions(undefined)).toEqual({
      difficulty: Difficulty.Steady,
      startingTier: SettlementTier.Hamlet,
      mapSize: null,
      seed: null,
      ignoredFields: [],
    });
    expect(defaultDifficulty).toBe(Difficulty.Steady);
    expect(defaultStartingTier).toBe(SettlementTier.Hamlet);
    expect(parseGameInitOptions({}).seed).toBeNull();
  });

  it("accepts valid values, including seed 0 and the maximum seed", () => {
    const options: GameInitOptions = {
      difficulty: Difficulty.Harsh,
      startingTier: SettlementTier.Village,
      mapSize: MapSize.Small,
      seed: 0,
    };
    expect(parseGameInitOptions(options)).toEqual({
      difficulty: Difficulty.Harsh,
      startingTier: SettlementTier.Village,
      mapSize: MapSize.Small,
      seed: 0,
      ignoredFields: [],
    });
    expect(parseGameInitOptions({ seed: maxSeed }).seed).toBe(maxSeed);
  });

  it("rejects an unknown difficulty with the exact message of spec 007 US4", () => {
    expect(messageOf('{"difficulty":"super-hard"}')).toBe(
      "Invalid difficulty: 'super-hard'. Valid values: peaceful, steady, harsh.",
    );
  });

  it("rejects the other fields with the same message shape", () => {
    expect(messageOf('{"startingTier":"city"}')).toBe(
      "Invalid startingTier: 'city'. Valid values: hamlet, village, market_town, chartered_town.",
    );
    expect(messageOf('{"mapSize":123}')).toBe(
      "Invalid mapSize: 123. Valid values: 0 (small), 1 (medium), 2 (large).",
    );
    expect(messageOf('{"seed":1.5}')).toBe(
      "Invalid seed: 1.5. Must be an integer from 0 to 4294967295.",
    );
    expect(messageOf('{"seed":-1}')).toContain("Invalid seed: -1.");
    expect(messageOf('{"seed":"7"}')).toContain("Invalid seed: '7'.");
    expect(messageOf('{"difficulty":null}')).toContain("Invalid difficulty: null.");
    expect(messageOf('{"difficulty":{"a":1}}')).toContain('Invalid difficulty: {"a":1}.');
  });

  it("reports every problem at once", () => {
    const message = messageOf('{"difficulty":"x","mapSize":"big"}');
    expect(message).toContain("Invalid difficulty: 'x'.");
    expect(message).toContain("Invalid mapSize: 'big'.");
  });

  it("rejects options that are not an object", () => {
    expect(messageOf('"hard"')).toBe("Invalid options: expected an object.");
    expect(messageOf("null")).toBe("Invalid options: expected an object.");
    expect(messageOf("[]")).toBe("Invalid options: expected an object.");
  });

  it("ignores unknown fields and lists them", () => {
    const parsed = parseUntyped('{"seed":5,"dificulty":"harsh","zeta":1}');
    expect(parsed.seed).toBe(5);
    expect(parsed.difficulty).toBe(Difficulty.Steady);
    expect(parsed.ignoredFields).toEqual(["dificulty", "zeta"]);
  });

  it("treats undefined fields as absent", () => {
    expect(parseGameInitOptions({ difficulty: undefined, seed: undefined }).seed).toBeNull();
  });
});
