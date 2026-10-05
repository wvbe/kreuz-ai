import { describe, expect, it } from "vitest";
import { createScenarioSession } from "../../../game/api/scenario/createScenarioSession";
import { executeReplLine } from "../runRepl";
import { createVerbRegistry } from "./verbRegistry";
import { statusVerbs } from "./statusVerbs";
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

describe("status verbs", () => {
  it("registers why, idle and flow", () => {
    expect(statusVerbs.map((verb) => verb.name)).toEqual(["why", "idle", "flow"]);
  });

  it("explains an idle citizen, lists it after the grace period and reports the flow", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "idle")).toBe("nothing is idle or blocked");
    expect(run(context, "flow")).toBe("no production or consumption recorded yet");
    context.session.dispatch({
      kind: "DebugSpawn",
      prototypeId: "oven",
      mapId: 1,
      cells: [300],
    });
    run(context, "step 14");
    const idle = run(context, "idle");
    expect(idle).toMatch(/Workstation#\d+ Idle since \d+: NoOrders/);
    expect(run(context, "idle all")).toContain("NoOrders");
    const ovenId = /Workstation#(\d+)/.exec(idle)?.[1] ?? "0";
    expect(run(context, `why ${ovenId}`)).toMatch(/^Workstation#\d+: Idle\n {2}NoOrders/);
    expect(run(context, "why 1")).toMatch(/^Citizen#1|error:/);
  });

  it("rejects bad usage and unknown subjects", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "why")).toContain("usage: why");
    expect(run(context, "why posting")).toContain("usage: why");
    expect(run(context, "why abc")).toContain("usage: why");
    expect(run(context, "why 99999")).toContain("is not something that has a status");
    expect(run(context, "why posting 99999")).toContain("is not something that has a status");
    expect(run(context, "idle later")).toContain("usage: idle");
    expect(run(context, "flow a b")).toContain("usage: flow");
    expect(run(context, "flow bread")).toContain("nothing recorded for bread");
  });

  it("answers with empty views before a game starts", () => {
    const context = createContext();
    expect(run(context, "idle")).toBe("nothing is idle or blocked");
    expect(run(context, "flow")).toBe("no production or consumption recorded yet");
    expect(run(context, "flow bread")).toContain("nothing recorded for bread");
    expect(run(context, "why 1")).toContain("is not something that has a status");
  });
});
