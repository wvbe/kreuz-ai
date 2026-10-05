import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GameSession } from "../GameSession";
import { defineScenarioStep } from "./scenarioStep";

const context = {
  session: new GameSession(),
  createSession: () => new GameSession(),
  hashes: new Map<string, string>(),
};

describe("defineScenarioStep", () => {
  const type = defineScenarioStep({
    key: "poke",
    schema: z.object({ poke: z.number().int() }).strict(),
    run: (step) => (step.poke > 0 ? null : { message: "not positive", actual: step.poke }),
  });

  it("exposes the key and validates the whole step object", () => {
    expect(type.key).toBe("poke");
    expect(type.validate({ poke: 1 })).toEqual([]);
    expect(type.validate({ poke: 1, extra: 2 })).not.toEqual([]);
    expect(type.validate({ poke: "x" })[0]).toContain("poke");
  });

  it("executes with the parsed step", () => {
    expect(type.execute({ poke: 1 }, context)).toBeNull();
    expect(type.execute({ poke: 0 }, context)).toEqual({ message: "not positive", actual: 0 });
  });
});
