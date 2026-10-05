import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadContent } from "../content/ContentLoader";
import { CommandMode } from "../engine/engineSystemTypes";
import { GameEngine } from "../engine/GameEngine";
import { defineCommand } from "./defineCommand";

describe("defineCommand", () => {
  const engine = new GameEngine(loadContent());

  it("passes a typed payload to the handler and keeps the schema and flags", () => {
    const schema = z.object({ amount: z.number().int() }).strict();
    const registration = defineCommand({
      schema,
      handler: (payload) => payload.amount * 2,
      mode: CommandMode.Immediate,
      requiresGame: false,
    });
    expect(registration.schema).toBe(schema);
    expect(registration.mode).toBe(CommandMode.Immediate);
    expect(registration.requiresGame).toBe(false);
    expect(registration.handler({ amount: 21 }, engine)).toBe(42);
  });

  it("leaves mode and requiresGame unset by default and rejects an invalid payload", () => {
    const registration = defineCommand({
      schema: z.object({ name: z.string() }).strict(),
      handler: () => null,
    });
    expect(registration.mode).toBeUndefined();
    expect(registration.requiresGame).toBeUndefined();
    expect(() => registration.handler({ name: 3 }, engine)).toThrow();
  });
});
