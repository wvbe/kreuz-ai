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

function start(): VerbContext {
  const context = createContext();
  run(context, "new 42 steady small");
  return context;
}

describe("settlement verbs", () => {
  it("tier shows the tier and the checklist of the next one", () => {
    const context = start();
    expect(run(context, "tier").text).toBe(
      [
        "tier: hamlet (a hamlet); reached: hamlet at tick 0",
        "next tier: village (a village) needs:",
        "  [ ] population 6/8",
        "  [ ] dwellings of level hovel or better 0/4",
        "  [ ] active throne_room zone 0/1",
        "evaluated 0 time(s), last at tick -; milestones reached: 0",
      ].join("\n"),
    );
  });

  it("tier counts the daily evaluation", () => {
    const context = start();
    run(context, "step 576");
    expect(run(context, "tier").text).toContain("evaluated 2 time(s), last at tick 576");
  });

  it("unlocks lists what is locked by default, with the lock text", () => {
    const context = start();
    const text = run(context, "unlocks").text;
    expect(text).toContain(
      "LOCKED   dwelling_level cottage (cottage) needs village: Unlocks at Village",
    );
    expect(text).toContain("burgher_house");
    expect(text).not.toContain("stockpile");
  });

  it("unlocks all, a tier and a kind filter the list", () => {
    const context = start();
    expect(run(context, "unlocks all").text).toContain("unlocked zone_type stockpile");
    expect(run(context, "unlocks village").text.split("\n")).toHaveLength(1);
    expect(run(context, "unlocks recipe").text).toContain("unlocked recipe bake_bread");
    expect(run(context, "unlocks chartered_town").text).toBe("nothing matches");
  });

  it("unlocks rejects an unknown filter and too many arguments", () => {
    const context = start();
    expect(run(context, "unlocks castle")).toMatchObject({ ok: false });
    expect(run(context, "unlocks village recipe")).toMatchObject({ ok: false });
  });

  it("milestones lists all seven, none reached at the start", () => {
    const context = start();
    const lines = run(context, "milestones").text.split("\n");
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe("throne-room-established: not yet");
  });

  it("tier needs a game; the content-only verbs answer without one; stray arguments are rejected", () => {
    const context = createContext();
    expect(run(context, "tier")).toMatchObject({ ok: false });
    expect(run(context, "unlocks").text).toContain("LOCKED");
    expect(run(context, "milestones").text.split("\n")).toHaveLength(7);
    const started = start();
    expect(run(started, "tier now")).toMatchObject({ ok: false, text: "error: usage: tier" });
    expect(run(started, "milestones now")).toMatchObject({
      ok: false,
      text: "error: usage: milestones",
    });
  });
});
