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

describe("crier verbs", () => {
  it("lists the starting crier and carries a posted job to the board", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "crier")).toMatch(/^crier #7 (available|traveling)/);
    expect(run(context, "pending")).toContain("no pending board updates");
    expect(run(context, "post 2 fell.trees 1 296 60")).toContain("queued PostJob");
    run(context, "step 2");
    expect(run(context, "pending")).toMatch(/update #1 for board #2: post fell\.trees at cell 296/);
    expect(run(context, "jobs 2")).not.toContain("prio 60");
    run(context, "step 200");
    expect(run(context, "pending")).toContain("no pending board updates");
  });

  it("cancels a pending update and unposts", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    run(context, "post 2 fell.trees 1 296");
    run(context, "step 1");
    expect(run(context, "pending cancel 1")).toContain("queued CancelPendingBoardUpdate");
    run(context, "step 1");
    expect(run(context, "pending")).toContain("no pending board updates");
    expect(run(context, "unpost 2 999")).toContain("queued RemovePosting");
  });

  it("appoints and dismisses a crier and rejects bad arguments", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "crier appoint 3")).toContain("queued AppointTownCrier");
    run(context, "step 1");
    expect(run(context, "crier")).toContain("crier #3");
    expect(run(context, "crier dismiss 3")).toContain("queued DismissTownCrier");
    expect(run(context, "crier x")).toContain("usage: crier");
    expect(run(context, "post 2")).toContain("usage: post");
    expect(run(context, "unpost 2")).toContain("usage: unpost");
    expect(run(context, "pending now")).toContain("usage: pending");
    expect(run(context, "pending cancel")).toContain("usage: pending");
  });
});
