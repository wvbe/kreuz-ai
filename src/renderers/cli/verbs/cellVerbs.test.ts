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

describe("cell verbs", () => {
  it("finds the fertile soil nearest to the village board (seed 42)", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    const lines = run(context, "find fertile_soil 4").split("\n");
    expect(lines[0]).toBe("fertile_soil, nearest to cell 282:");
    expect(lines[1]?.split(" ")[0]).toBe("258");
    expect(run(context, "find lava")).toBe("no lava cells on the map");
  });

  it("shows a cell with its neighbors", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    const text = run(context, "cell 1 326");
    expect(text).toContain("cell 1:326 grassland");
    expect(text).toContain("neighbors: 297 325 327 354");
  });

  it("rejects bad arguments and unknown cells", () => {
    const context = createContext();
    expect(run(context, "find fertile_soil")).toBe("error: there is no map");
    run(context, "new 42 steady small");
    expect(run(context, "find")).toContain("usage: find");
    expect(run(context, "find x 0")).toContain("usage: find");
    expect(run(context, "cell 1")).toContain("usage: cell");
    expect(run(context, "cell 1 99999")).toContain("not-found");
  });
});
