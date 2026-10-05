import { describe, expect, it } from "vitest";
import { createScenarioSession } from "../../../game/api/scenario/createScenarioSession";
import { executeReplLine } from "../runRepl";
import { createVerbRegistry } from "./verbRegistry";
import type { VerbContext } from "./Verb";

function createContext(): VerbContext {
  return {
    session: createScenarioSession(),
    files: {
      readText: () => "",
      writeText: () => undefined,
    },
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

describe("production verbs", () => {
  it("creates, lists, inspects, pauses, reprioritises and cancels orders", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "orders")).toBe("no production orders");
    context.session.dispatch({
      kind: "DebugSpawn",
      prototypeId: "sawmill",
      mapId: 1,
      cells: [300],
    });
    run(context, "step 1");
    expect(run(context, "order create saw_oak_planks 2 10 70")).toContain(
      "queued CreateProductionOrder",
    );
    run(context, "step 1");
    expect(run(context, "orders")).toMatch(
      /^#1 saw_oak_planks 0\/2 at workstation #10: active, priority 70\n {4}blocked: MissingInput materialId=oak_log/,
    );
    expect(run(context, "orders 10")).toContain("#1 saw_oak_planks");
    expect(run(context, "orders 77")).toBe("no production orders");
    expect(run(context, "order 1")).toMatch(
      /^#1 saw_oak_planks.*\n {2}no posting out\n {2}blocked: /,
    );
    expect(run(context, "order priority 1 20")).toContain("queued SetProductionOrderPriority");
    expect(run(context, "order pause 1")).toContain("queued SetProductionOrderPaused");
    run(context, "step 1");
    expect(run(context, "orders")).toContain("paused, priority 20");
    expect(run(context, "order resume 1")).toContain("queued SetProductionOrderPaused");
    expect(run(context, "order interrupt 10")).toContain("queued CancelCraft");
    expect(run(context, "order cancel 1")).toContain("queued CancelProductionOrder");
    run(context, "step 1");
    expect(run(context, "orders")).toContain("cancelled");
    expect(run(context, "order 99")).toBe("order 99 does not exist");
  });

  it("explains mistakes", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "orders x")).toBe("error: usage: orders [workstationId]");
    expect(run(context, "orders 1 2")).toBe("error: usage: orders [workstationId]");
    expect(run(context, "order")).toMatch(/^error: usage: order </);
    expect(run(context, "order create")).toMatch(/^error: usage: order </);
    expect(run(context, "order create saw_oak_planks x")).toMatch(/^error: usage: order </);
    expect(run(context, "order create saw_oak_planks 1 2 3 4")).toMatch(/^error: usage: order </);
    expect(run(context, "order cancel")).toMatch(/^error: usage: order </);
    expect(run(context, "order cancel 1 2")).toMatch(/^error: usage: order </);
    expect(run(context, "order pause 1 2")).toMatch(/^error: usage: order </);
    expect(run(context, "order priority 1")).toMatch(/^error: usage: order </);
    expect(run(context, "order priority 1 2 3")).toMatch(/^error: usage: order </);
    expect(run(context, "order interrupt 1 2")).toMatch(/^error: usage: order </);
    expect(run(context, "order 1 2")).toMatch(/^error: usage: order </);
  });

  it("reports a rejected command at dispatch time", () => {
    const context = createContext();
    expect(run(context, "order create saw_oak_planks 1")).toMatch(/^error: /);
  });
});
