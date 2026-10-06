import { describe, expect, it } from "vitest";
import { createScenarioSession } from "../../../game/api/scenario/createScenarioSession";
import { executeReplLine } from "../runRepl";
import { createVerbRegistry } from "./verbRegistry";
import type { VerbContext } from "./Verb";

function createContext(): VerbContext {
  return {
    session: createScenarioSession(),
    files: { readText: () => "", writeText: () => undefined },
    verbs: createVerbRegistry(),
  };
}

function run(context: VerbContext, line: string): { ok: boolean; text: string } {
  const output = executeReplLine(context, line);
  if (output === null) {
    throw new Error("expected output");
  }
  return output;
}

describe("housing verbs", () => {
  it("homes shows empty totals at the start and refuses arguments", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "homes").text).toBe(
      "housing: 0 dwelling(s), 0 active; 0 housed, 6 homeless, 0 free slot(s); hovel 0, cottage 0, timber_framed_house 0, burgher_house 0",
    );
    expect(run(context, "homes now")).toEqual({ ok: false, text: "error: usage: homes" });
  });

  it("home explains a dwelling, designated like any zone", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    run(context, "zone designate dwelling 1 196 217 218 219");
    run(context, "step 2");
    const text = run(context, "homes").text;
    // Nothing stands around the cells yet: a zone without walls and a bed is no dwelling.
    expect(text).toContain("0 dwelling(s)");
    expect(run(context, "home 5")).toEqual({
      ok: false,
      text: "error: entity 5 is not a dwelling",
    });
    expect(run(context, "home")).toEqual({ ok: false, text: "error: usage: home <dwellingId>" });
    expect(run(context, "home x")).toEqual({ ok: false, text: "error: usage: home <dwellingId>" });
  });

  it("answers with an empty settlement before a game and says a missing dwelling is none", () => {
    const context = createContext();
    expect(run(context, "homes").text).toContain("housing: 0 dwelling(s)");
    expect(run(context, "home 3")).toEqual({
      ok: false,
      text: "error: entity 3 is not a dwelling",
    });
  });
});
