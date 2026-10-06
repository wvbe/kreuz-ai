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

function start(): VerbContext {
  const context = createContext();
  run(context, "new 42 steady small");
  return context;
}

/**
 * The faction id the table shows for a content faction name.
 */
function factionId(context: VerbContext, name: string): string {
  return new RegExp(`faction #(\\d+) ${name}`).exec(run(context, "diplomacy"))?.[1] ?? "0";
}

describe("diplomacy verbs", () => {
  it("shows the three NPC factions with their standing and bands", () => {
    const context = start();
    const table = run(context, "diplomacy");
    expect(table).toContain("Travelling merchants (mercantile, mercantile)");
    expect(table).toContain("Barony of Ashford (political, aggressive)");
    expect(table).toContain("we see them -5 (wary), they see us -5 (wary)");
    expect(table).toContain("we see them 20 (friendly), they see us 25 (friendly)");
    expect(table).toContain("Baron of the Barony of Ashford");
  });

  it("sends a gift and lists it as a directive with its ETA", () => {
    const context = start();
    const id = factionId(context, "Barony of Ashford");
    expect(run(context, "directives")).toContain("no directives pending");
    expect(run(context, `gift ${id} 100`)).toContain("queued IssueDiplomaticAct");
    run(context, "step 1");
    const listing = run(context, "directives");
    expect(listing).toMatch(
      /^envoy #\d+ gift to #\d+ Barony of Ashford, carrying 100 silver_penny: traveling, arrives at tick \d+/,
    );
    expect(run(context, "treasury")).toBe("treasury: 900 coins");
    run(context, "step 450");
    // the gift arrived: the baron's standing toward us rose from -5 (an insult may have cost a
    // point or two since)
    const theirs =
      /Barony of Ashford[^\n]*\n {2}we see them -?\d+ \(\w+\), they see us (-?\d+)/.exec(
        run(context, "diplomacy"),
      )?.[1];
    expect(Number(theirs)).toBeGreaterThan(-5);
  });

  it("proposes an agreement to a friendly faction and shows it afterwards", () => {
    const context = start();
    const id = factionId(context, "Abbey of St Wulfric");
    expect(run(context, "agreements")).toContain("no trade agreements");
    expect(run(context, `envoy ${id} agreement`)).toContain("queued IssueDiplomaticAct");
    run(context, "step 450");
    expect(run(context, "agreements")).toContain("trade agreement: #1 Settlement and");
    expect(run(context, "diplomacy")).toContain("trade agreement");
  });

  it("declares war, which cancels an agreement, and lists the envoys", () => {
    const context = start();
    const id = factionId(context, "Abbey of St Wulfric");
    run(context, `envoy ${id} agreement`);
    run(context, "step 450");
    expect(run(context, `envoy ${id} war`)).toContain("declare war");
    run(context, "step 450");
    expect(run(context, "agreements")).toContain("no trade agreements");
    expect(run(context, "diplomacy")).toContain("HOSTILE");
    expect(run(context, "envoy")).toContain("declaration (war)");
  });

  it("cancels a directive in flight and refunds the gift", () => {
    const context = start();
    const id = factionId(context, "Barony of Ashford");
    run(context, `gift ${id} 300`);
    run(context, "step 1");
    const envoyId = /envoy #(\d+)/.exec(run(context, "directives"))?.[1] ?? "0";
    expect(run(context, `envoy cancel ${envoyId}`)).toContain("queued CancelDiplomaticDirective");
    run(context, "step 1");
    expect(run(context, "directives")).toContain("no directives pending");
    expect(run(context, "treasury")).toBe("treasury: 1000 coins");
  });

  it("answers proposals and sets leaders", () => {
    const context = start();
    // the friendly abbey offers an agreement on its own (NPC AI) within the first days
    for (
      let guard = 0;
      guard < 12 && !run(context, "proposals").includes("proposal #");
      guard += 1
    ) {
      run(context, "step 50");
    }
    const proposals = run(context, "proposals");
    expect(proposals).toContain("answer with respond");
    const proposalId = /proposal #(\d+)/.exec(proposals)?.[1] ?? "0";
    expect(run(context, `respond ${proposalId} accept`)).toContain("queued RespondToProposal");
    run(context, "step 1");
    expect(run(context, "proposals")).toContain("no open proposals");
    const id = factionId(context, "Abbey of St Wulfric");
    expect(run(context, `leader ${id} none`)).toContain("is none");
    run(context, "step 2");
    expect(run(context, "diplomacy")).toContain("leader #");
  });

  it("rejects bad arguments", () => {
    const context = start();
    expect(run(context, "diplomacy now")).toContain("usage: diplomacy");
    expect(run(context, "gift")).toContain("usage: gift");
    expect(run(context, "gift 12 x")).toContain("usage: gift");
    expect(run(context, "gift 12 0")).toContain("usage: gift");
    expect(run(context, "gift 12 bread")).toContain("usage: gift");
    expect(run(context, "gift 12 bread 0")).toContain("usage: gift");
    expect(run(context, "envoy 12")).toContain("usage: envoy");
    expect(run(context, "envoy 12 dance")).toContain("usage: envoy");
    expect(run(context, "envoy cancel")).toContain("usage: envoy");
    expect(run(context, "directives now")).toContain("usage: directives");
    expect(run(context, "agreements now")).toContain("usage: agreements");
    expect(run(context, "proposals now")).toContain("usage: proposals");
    expect(run(context, "respond 1 maybe")).toContain("usage: respond");
    expect(run(context, "leader 12")).toContain("usage: leader");
    expect(run(context, "leader 12 x")).toContain("usage: leader");
  });

  it("reports a refused act as a rejected command on the next tick", () => {
    const context = start();
    expect(run(context, "envoy 999 overture")).toContain("queued IssueDiplomaticAct");
    const output = run(context, "step 1");
    expect(output).toContain("command.rejected");
    expect(output).toContain("diplomacy.act.refused");
    expect(output).toContain("UnknownFaction");
  });

  it("sends goods from the treasury inventory", () => {
    const context = start();
    const id = factionId(context, "Barony of Ashford");
    expect(run(context, `gift ${id} bread 2`)).toContain("queued IssueDiplomaticAct");
    expect(run(context, "step 1")).toContain("InsufficientFunds");
  });
});
