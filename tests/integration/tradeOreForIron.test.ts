import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/api/GameSession";
import { formatScenarioResult } from "../../src/game/api/scenario/formatScenarioResult";
import { runScenario } from "../../src/game/api/scenario/runScenario";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import type { Scenario } from "../../src/game/api/scenario/Scenario";
import type { JsonValue } from "../../src/game/engine/EventBus";

// Hamlet reachability of the owner's trader rule (conflict item 9, D-13): a Hamlet mines ore with
// the existing mine.ore jobs, sells it to the visiting trader and later buys exactly the refined
// iron the sale earned. The script scenarios/trade-ore-for-iron.json uses player commands only.

const scenarioPath = join(__dirname, "..", "..", "scenarios", "trade-ore-for-iron.json");

function loadScenario(): Scenario {
  const parsed = parseScenario(readFileSync(scenarioPath, "utf8"));
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  return parsed.scenario;
}

type Completed = {
  buyerId: number;
  sellerId: number;
  items: { materialId: string; quantity: number }[];
  payment: { materialId: string; quantity: number }[];
};

describe("Hamlet: sell ore, buy iron (player commands only)", () => {
  it("is a real-commands-only script that passes through the plain session", () => {
    expect(readFileSync(scenarioPath, "utf8")).not.toContain("debugSpawn");
    const result = runScenario(loadScenario(), { createSession: () => new GameSession() });
    expect(formatScenarioResult(result)).toMatch(/^PASS trade-ore-for-iron/);
  });

  it("is deterministic: two runs end in the same tick and state hash", () => {
    const first = runScenario(loadScenario());
    const second = runScenario(loadScenario());
    expect(first.ok && second.ok).toBe(true);
    expect(second).toEqual(first);
  });

  it("sells 8 ore, can then buy exactly 4 ingots (not 5), keeps the rest of the credit over the visit", () => {
    const completed: Completed[] = [];
    const credits: number[] = [];
    const refused: { kind: string; materialId: string }[] = [];
    const arrivals: number[] = [];
    const sessions: GameSession[] = [];
    const result = runScenario(loadScenario(), {
      createSession: () => {
        const session = new GameSession();
        if (sessions.length > 0) {
          // The replay step builds more sessions; only the first one is the played game.
          sessions.push(session);
          return session;
        }
        session.engine.bus.subscribe("trade.completed", (payload: JsonValue) => {
          completed.push(payload as unknown as Completed);
        });
        session.engine.bus.subscribe("trade.credit.changed", (payload: JsonValue) => {
          credits.push((payload as unknown as { creditMilli: number }).creditMilli);
        });
        session.engine.bus.subscribe("trade.order.refused", (payload: JsonValue) => {
          refused.push(payload as unknown as { kind: string; materialId: string });
        });
        session.engine.bus.subscribe("trader.arrived", () => {
          arrivals.push(session.engine.time.tickCount);
        });
        sessions.push(session);
        return session;
      },
    });
    expect(result.ok).toBe(true);
    const quantity = (items: Completed["items"], materialId: string): number =>
      items
        .filter((item) => item.materialId === materialId)
        .reduce((sum, item) => sum + item.quantity, 0);
    const oreSold = completed.reduce((sum, trade) => sum + quantity(trade.items, "iron_ore"), 0);
    const ingotsBought = completed.reduce(
      (sum, trade) => sum + quantity(trade.items, "iron_ingot"),
      0,
    );
    expect(oreSold).toBe(8);
    expect(ingotsBought).toBe(4);
    expect(refused).toEqual([
      expect.objectContaining({ kind: "RefinedCreditExhausted", materialId: "iron_ingot" }),
    ]);
    // The credit only grows with sales and only falls with purchases, never by time.
    expect(credits).toContain(4000);
    expect(credits).toContain(1000);
    expect(credits.at(-1)).toBe(0);
    expect(arrivals).toHaveLength(2);
    const session = sessions[0] as GameSession;
    const stock = session.query.run("stock", { materialId: "iron_ingot" });
    expect(stock.ok && stock.data).toMatchObject({ total: 4 });
  });
});
