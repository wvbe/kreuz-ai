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

describe("standing verbs", () => {
  it("lists nothing before the first order and creates one by command", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "standing").text).toBe(
      "no standing orders (standing create <materialId> <target>)",
    );
    expect(run(context, "standing create bread 20 priority=60").text).toBe(
      "queued CreateStandingOrder: keep 20 bread in stock (applied on the next tick)",
    );
    run(context, "step 2");
    const listed = run(context, "standing list").text;
    expect(listed).toContain("#1 bread:");
    expect(listed).toContain("stock 12/20 (restock at 15)");
    expect(listed).toContain("priority 60");
    expect(run(context, "standing 1").text).toContain("recipe bake_bread (3 per run)");
  });

  it("edits, pauses, resumes and deletes an order", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    run(context, "standing create bread 20");
    run(context, "step 2");
    expect(run(context, "standing edit 1 target=30 threshold=20 board=none").ok).toBe(true);
    run(context, "step 1");
    expect(run(context, "standing 1").text).toContain("stock 12/30 (restock at 20)");
    run(context, "standing pause 1");
    run(context, "step 1");
    expect(run(context, "standing").text).toContain("Paused");
    run(context, "standing resume 1");
    run(context, "standing delete 1");
    run(context, "step 1");
    expect(run(context, "standing").text).toContain("no standing orders");
  });

  it("explains a refused command and bad usage", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "standing create wheat 20").text).toContain("queued");
    run(context, "step 2");
    expect(run(context, "standing").text).toContain("no standing orders");
    expect(run(context, "standing 9")).toEqual({ ok: false, text: "error: no standing order #9" });
    for (const line of [
      "standing create",
      "standing create bread x",
      "standing create bread 20 nonsense",
      "standing create bread 20 board=none",
      "standing edit 1",
      "standing edit x target=3",
      "standing pause",
      "standing pause 1 2",
      "standing list now",
      "standing x",
    ]) {
      expect(run(context, line).ok).toBe(false);
      expect(run(context, line).text).toContain("usage: standing");
    }
  });

  it("creates a zone-scoped order with its recipe and board options", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(
      run(context, "standing create bread 10 recipe=bake_bread threshold=5 zone=5 board=2").ok,
    ).toBe(true);
  });
});

describe("steward verbs", () => {
  it("shows the empty office and appoints a settler", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "steward").text).toContain("steward: nobody");
    expect(run(context, "steward appoint 3").text).toBe(
      "queued AppointSteward: appoint #3 (applied on the next tick)",
    );
    run(context, "step 1");
    expect(run(context, "steward").text).toContain("steward: #3");
  });

  it("asks for a review, sets and clears a board and dismisses", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    run(context, "steward appoint 3");
    expect(run(context, "steward review").ok).toBe(true);
    expect(run(context, "steward board 2").ok).toBe(true);
    run(context, "step 1");
    expect(run(context, "steward").text).toContain("own board #2");
    expect(run(context, "steward board none").ok).toBe(true);
    expect(run(context, "steward dismiss").ok).toBe(true);
    run(context, "step 1");
    expect(run(context, "steward").text).toContain("own board none");
  });

  it("refuses bad usage and says what a refused command means", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    for (const line of [
      "steward appoint",
      "steward appoint x",
      "steward dismiss now",
      "steward review now",
      "steward board",
      "steward board x",
      "steward nonsense",
    ]) {
      expect(run(context, line)).toEqual({
        ok: false,
        text: "error: usage: steward | steward appoint <entityId> | steward dismiss | steward review | steward board <boardId|none>",
      });
    }
    expect(run(context, "steward appoint 1").ok).toBe(true);
  });

  it("answers without a game", () => {
    const context = createContext();
    expect(run(context, "steward").ok).toBe(true);
  });
});
