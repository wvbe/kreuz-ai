import { describe, expect, it } from "vitest";
import { createScenarioSession } from "../../../game/api/scenario/createScenarioSession";
import { loadVillageBakeryContent } from "../../../game/content/loadVillageBakeryContent";
import { executeReplLine } from "../runRepl";
import { createVerbRegistry } from "./verbRegistry";
import type { VerbContext } from "./Verb";

function createContext(): VerbContext {
  return {
    session: createScenarioSession(loadVillageBakeryContent()),
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

describe("construction verbs", () => {
  it("places, lists, reprioritises and cancels construction jobs", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "sites")).toBe("no construction jobs");
    expect(run(context, "build check table 1 300")).toBe("table at 1:300: ok");
    expect(run(context, "build table 1 300")).toContain("queued PlaceFurniture");
    expect(run(context, "build wall 1 301 302")).toContain("queued PlaceWall");
    expect(run(context, "build door 1 303")).toContain("queued PlaceDoor");
    run(context, "step 1");
    const listing = run(context, "sites");
    expect(listing).toMatch(/Construction table at 1:300: planned, priority 50, oak_plank 0\/3/);
    expect(listing.match(/Construction wall/g)).toHaveLength(2);
    expect(listing).toContain("Construction door at 1:303");
    expect(run(context, "sites 1")).toContain("table");
    expect(run(context, "build priority 10 90")).toContain("queued SetConstructionPriority");
    expect(run(context, "build pause 10")).toContain("queued SetConstructionJobPaused");
    expect(run(context, "build resume 10")).toContain("queued SetConstructionJobPaused");
    expect(run(context, "build front 10")).toContain("queued MoveConstructionJobToFront");
    expect(run(context, "build cancel 10")).toContain("queued CancelConstructionJob");
    run(context, "step 1");
    expect(run(context, "sites")).toContain("finished #");
  });

  it("shows the build menu and refuses a bad placement before queueing", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "build menu")).toContain("oven: stone_block 6; 48 ticks");
    expect(run(context, "build oven 1 300")).toMatch(
      /^error: oven at 1:300: TierLocked \(Unlocks at Village\)/,
    );
    expect(run(context, "build check oven 1 300")).toMatch(/TierLocked/);
    expect(run(context, "build table 1 99999")).toMatch(/^error: table at 1:99999: OutOfBounds/);
  });

  it("takes buildings down", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "build remove 9")).toContain("queued QueueDeconstruction");
  });

  it("explains mistakes", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "build")).toMatch(/^error: usage: build </);
    expect(run(context, "build table")).toMatch(/^error: usage: build </);
    expect(run(context, "build table 1")).toMatch(/^error: usage: build </);
    expect(run(context, "build table 1 300 301")).toMatch(/^error: usage: build </);
    expect(run(context, "build door 1 300 301")).toMatch(/^error: usage: build </);
    expect(run(context, "build cancel")).toMatch(/^error: usage: build </);
    expect(run(context, "build cancel 1 2")).toMatch(/^error: usage: build </);
    expect(run(context, "build priority 1")).toMatch(/^error: usage: build </);
    expect(run(context, "build check table 1")).toMatch(/^error: usage: build </);
    expect(run(context, "build menu now")).toMatch(/^error: usage: build </);
    expect(run(context, "sites x")).toBe("error: usage: sites [mapId]");
  });
});
