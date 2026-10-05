import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadContent } from "../content/ContentLoader";
import { GameEngine } from "../engine/GameEngine";
import { defineQuery } from "./defineQuery";

describe("defineQuery", () => {
  const engine = new GameEngine(loadContent());

  it("passes typed arguments to the view function", () => {
    const schema = z.object({ factor: z.number().int() }).strict();
    const registration = defineQuery({
      schema,
      run: (args, host) => ({ value: args.factor * 3, content: host.content.terrain.ids().length }),
    });
    expect(registration.schema).toBe(schema);
    const view = registration.run({ factor: 2 }, engine);
    expect(view).toMatchObject({ value: 6 });
  });

  it("rejects invalid arguments", () => {
    const registration = defineQuery({
      schema: z.object({ factor: z.number().int() }).strict(),
      run: () => null,
    });
    expect(() => registration.run({ factor: "x" }, engine)).toThrow();
  });
});
