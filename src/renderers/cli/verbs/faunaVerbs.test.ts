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

function run(context: VerbContext, line: string): string {
  const output = executeReplLine(context, line);
  if (output === null) {
    throw new Error("expected output");
  }
  return output.text;
}

describe("fauna verbs", () => {
  it("lists the wild animals of a new world and filters by kind", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    const all = run(context, "animals");
    expect(all).toContain("wild, 0 livestock");
    expect(all).toContain("deer (wild)");
    expect(run(context, "animals wild")).toContain("deer (wild)");
    expect(run(context, "animals livestock")).toContain("no animals");
  });

  it("shows the animals in the entities listing too, and moving ones after a while", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "entities")).toContain("deer");
    run(context, "step 120");
    expect(run(context, "animals")).toMatch(/stand around|move to cell/);
  });

  it("rejects bad arguments", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "animals pets")).toContain("usage: animals [wild|livestock]");
    expect(run(context, "animals wild 1")).toContain("usage: animals [wild|livestock]");
  });
});
