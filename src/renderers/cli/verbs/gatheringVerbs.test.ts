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

describe("gathering verbs", () => {
  it("lists the crop cells of a designated field and shows the new job types on the board", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "fields")).toContain("no crop cells");
    run(context, "zone designate farm_field 1 230 258 259 279 280 281");
    run(context, "step 20");
    const listing = run(context, "fields");
    expect(listing).toContain("field #10: 3 cells, ");
    expect(listing).toContain("1:230 wheat");
    expect(run(context, "fields 10")).toContain("field #10");
    expect(run(context, "fields 999")).toContain("no crop cells");
    const jobs = run(context, "jobs");
    expect(jobs).toMatch(/farm\.sow|mine\.ore|quarry\.stone/);
  });

  it("rejects bad arguments", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "fields x")).toContain("usage: fields [zoneId]");
    expect(run(context, "fields 1 2")).toContain("usage: fields [zoneId]");
  });
});
