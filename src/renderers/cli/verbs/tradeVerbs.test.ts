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

function untilTraderPresent(context: VerbContext): void {
  for (let guard = 0; guard < 60 && !run(context, "traders").includes("Present"); guard += 1) {
    run(context, "step 25");
  }
}

describe("trade verbs", () => {
  it("shows the treasury, no trader, no orders and no credit at the start", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "treasury")).toBe("treasury: 1000 coins");
    expect(run(context, "traders")).toContain("no trader is here");
    expect(run(context, "traders")).toContain("next caravan at tick");
    expect(run(context, "trade orders")).toContain("no trade orders");
    expect(run(context, "trade offers")).toBe("no open offers");
    expect(run(context, "ledger")).toContain("no refined credit");
  });

  it("quotes, orders a sale and shows the order and its credit", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    untilTraderPresent(context);
    const listing = run(context, "traders");
    const id = /trader #(\d+)/.exec(listing)?.[1] ?? "0";
    expect(run(context, `trade quote sell ${id} iron_ore 10`)).toContain("23 coins");
    expect(run(context, `trade quote buy ${id} nails`)).toContain("1 nails, buy from the trader");
    expect(run(context, `trade sell ${id} iron_ore 4`)).toContain("queued TradeSell");
    run(context, "step 2");
    expect(run(context, "trade orders")).toContain("order #1 sell iron_ore 0/4");
    expect(run(context, `trade cancel 1`)).toContain("queued CancelTradeOrder");
    run(context, "step 2");
    expect(run(context, "trade orders")).toContain("Cancelled");
  });

  it("rejects bad arguments", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "trade")).toContain("usage: trade");
    expect(run(context, "trade sell x iron_ore 4")).toContain("usage: trade");
    expect(run(context, "trade sell 4 iron_ore")).toContain("usage: trade");
    expect(run(context, "trade quote up 4 nails")).toContain("usage: trade");
    expect(run(context, "trade cancel x")).toContain("usage: trade");
    expect(run(context, "traders now")).toContain("usage: traders");
    expect(run(context, "treasury now")).toContain("usage: treasury");
    expect(run(context, "ledger now")).toContain("usage: ledger");
  });

  it("reports a refused order as a rejected command on the next tick", () => {
    const context = createContext();
    run(context, "new 42 steady small");
    expect(run(context, "trade buy 99 nails 1")).toContain("queued TradeBuy");
    const output = run(context, "step 1");
    expect(output).toContain("command.rejected");
    expect(output).toContain("trade.order.refused");
    expect(output).toContain("UnknownTrader");
  });
});
