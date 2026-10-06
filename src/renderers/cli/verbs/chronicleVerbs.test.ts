import { describe, expect, it } from "vitest";
import { createScenarioSession } from "../../../game/api/scenario/createScenarioSession";
import { executeReplLine } from "../runRepl";
import { createVerbRegistry } from "./verbRegistry";
import type { VerbContext } from "./Verb";

function start(): VerbContext {
  const context: VerbContext = {
    session: createScenarioSession(),
    files: { readText: () => "", writeText: () => undefined },
    verbs: createVerbRegistry(),
  };
  run(context, "new 42 steady small");
  return context;
}

function run(context: VerbContext, line: string): { ok: boolean; text: string } {
  const output = executeReplLine(context, line);
  if (output === null) {
    throw new Error("expected output");
  }
  return output;
}

describe("chronicle verbs", () => {
  it("chronicle lists the Major moments newest first with a count line", () => {
    const context = start();
    run(context, "step 10");
    const output = run(context, "chronicle");
    expect(output.ok).toBe(true);
    expect(output.text.split("\n")[0]).toBe("chronicle: 1 of 1 entries (it keeps 200)");
    expect(output.text).toContain(
      "* day 1, tick 0: Godfrey the Carpenter, Reeve of the Settlement",
    );
    expect(output.text).toContain("took office.");
  });

  it("chronicle filters by citizen and kind and takes a count", () => {
    const context = start();
    run(context, "step 10");
    expect(run(context, "chronicle 5 citizen 5").text).toContain("1 of 1 entries");
    expect(run(context, "chronicle citizen 3").text).toContain("0 of 0 entries");
    expect(run(context, "chronicle kind took_office").text).toContain("1 of 1 entries");
    expect(run(context, "chronicle 1 kind tier_reached").text).toContain("0 of 0 entries");
  });

  it("chronicle rejects bad arguments", () => {
    const context = start();
    expect(run(context, "chronicle 0").ok).toBe(false);
    expect(run(context, "chronicle citizen").ok).toBe(false);
    expect(run(context, "chronicle citizen x").ok).toBe(false);
    expect(run(context, "chronicle kind nonsense").text).toContain('unknown kind "nonsense"');
    expect(run(context, "chronicle whatever").ok).toBe(false);
  });

  it("journal shows the arrival and later firsts of a settler", () => {
    const context = start();
    run(context, "step 300");
    const lines = run(context, "journal 3").text.split("\n");
    expect(lines[0]).toMatch(/^journal of #3: \d+ of 16 entries$/);
    expect(lines[1]).toContain("has come to the hamlet.");
    expect(lines.some((line) => line.includes("finished a first piece of"))).toBe(true);
  });

  it("journal needs one id of a citizen", () => {
    const context = start();
    expect(run(context, "journal").text).toBe("error: usage: journal <id>");
    expect(run(context, "journal 1").text).toBe("error: entity 1 has no journal");
    expect(run(context, "journal 3 4").ok).toBe(false);
  });

  it("inspect shows the last journal lines of a citizen", () => {
    const context = start();
    run(context, "step 300");
    const text = run(context, "inspect 3").text;
    expect(text).toContain("  journal:");
    expect(text).toContain("    day 1: ");
  });
});
