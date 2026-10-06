import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/api/GameSession";
import { runScenario } from "../../src/game/api/scenario/runScenario";
import { parseScenario } from "../../src/game/api/scenario/Scenario";
import { loadContent } from "../../src/game/content/ContentLoader";
import { getComponent, hasComponent } from "../../src/game/ecs/Entity";
import { maxMeterMilli } from "../../src/game/ai/aiTypes";
import { needsComponent } from "../../src/game/ai/needs/needsComponent";
import type { Entity } from "../../src/game/ecs/Entity";
import type { JsonValue } from "../../src/game/engine/EventBus";
import { GameEngine } from "../../src/game/engine/GameEngine";
import { inventoryComponent } from "../../src/game/inventory/inventoryComponent";
import { getTotal } from "../../src/game/inventory/inventoryQueries";
import { MapSize } from "../../src/game/map/mapSize";
import { traderComponent } from "../../src/game/trade/traderComponent";
import { createTradeWorld } from "../../src/game/trade/testTradeWorld";
import type { TradeTestWorld } from "../../src/game/trade/testTradeWorld";
import { getTradeService } from "../../src/game/trade/tradeServiceRegistry";
import { traderArrivedEvent, traderPrototypeId } from "../../src/game/trade/tradeTypes";
import { presentTrader } from "../../src/game/trade/traderVisits";
import { ticksPerDay } from "../../src/game/time/GameTime";

// Plan 4.1 acceptance: the refined-credit ledger of D-13 (owner rule), item and coin
// conservation under random trading, save/load in the middle of a negotiation and determinism of
// the trader visits. Protocol-level tests use the real commands without settler AI; the order
// flow with settlers is played in scenarios/trade-ore-for-iron.json.

const ore = (quantity: number) => [{ materialId: "iron_ore", quantity }];
const ingot = (quantity: number) => [{ materialId: "iron_ingot", quantity }];

type Hamlet = { world: TradeTestWorld; settler: Entity; trader: Entity };

function hamlet(): Hamlet {
  const world = createTradeWorld({ seed: 21 });
  const trader = world.trader(3);
  const settler = world.settler(4);
  world.give(settler, "iron_ore", 40);
  world.give(settler, "silver_penny", 200);
  world.command("SetSellsItems", { entityId: settler.id, value: true });
  return { world, settler, trader };
}

function sellOre(h: Hamlet, quantity: number, coins: number): void {
  h.world.command("ProposeTrade", {
    buyerId: h.trader.id,
    sellerId: h.settler.id,
    requested: ore(quantity),
    offeredCoins: coins,
  });
  h.world.run(1);
}

function buyIngots(h: Hamlet, trader: Entity, quantity: number): void {
  h.world.command("ProposeTrade", {
    buyerId: h.settler.id,
    sellerId: trader.id,
    requested: ingot(quantity),
    offeredCoins: 20 * quantity,
  });
  h.world.run(1);
}

function creditMilli(world: TradeTestWorld): number {
  const entries = world.query("trade-ledger") as { creditMilli: number }[];
  return entries[0]?.creditMilli ?? 0;
}

describe("trader refined-credit ledger (D-13, owner rule)", () => {
  it("sell 10 ore, buy exactly 5 ingots and not a sixth", () => {
    const h = hamlet();
    const rejected = h.world.record("trade.offer.rejected");
    sellOre(h, 10, 23);
    expect(getTotal(h.trader, "iron_ore")).toBe(10);
    expect(creditMilli(h.world)).toBe(5000);
    h.world.run(1);
    expect(getTotal(h.trader, "iron_ingot")).toBe(5);
    buyIngots(h, h.trader, 6);
    h.world.engine.bus.processQueue();
    expect(rejected.at(-1)).toMatchObject({
      reason: "insufficient-stock",
      detail: "refined-credit-exhausted",
    });
    expect(getTotal(h.settler, "iron_ingot")).toBe(0);
    buyIngots(h, h.trader, 5);
    expect(getTotal(h.settler, "iron_ingot")).toBe(5);
    expect(creditMilli(h.world)).toBe(0);
    buyIngots(h, h.trader, 1);
    h.world.engine.bus.processQueue();
    expect(getTotal(h.settler, "iron_ingot")).toBe(5);
    expect(rejected).toHaveLength(2);
  });

  it("partial purchases draw the credit down and a second sale adds to what is left", () => {
    const h = hamlet();
    sellOre(h, 10, 23);
    buyIngots(h, h.trader, 2);
    expect(creditMilli(h.world)).toBe(3000);
    sellOre(h, 4, 10);
    expect(creditMilli(h.world)).toBe(5000);
    h.world.run(1);
    buyIngots(h, h.trader, 5);
    expect(getTotal(h.settler, "iron_ingot")).toBe(7);
    expect(creditMilli(h.world)).toBe(0);
  });

  it("an odd amount of ore leaves half an ingot of credit that the next sale completes", () => {
    const h = hamlet();
    sellOre(h, 3, 7);
    expect(creditMilli(h.world)).toBe(1500);
    h.world.run(1);
    buyIngots(h, h.trader, 1);
    expect(creditMilli(h.world)).toBe(500);
    buyIngots(h, h.trader, 1);
    expect(getTotal(h.settler, "iron_ingot")).toBe(1);
    sellOre(h, 1, 3);
    expect(creditMilli(h.world)).toBe(1000);
  });

  it("credit never expires: 5000 ticks, the trader leaves and returns with its stashed stock", () => {
    const h = hamlet();
    sellOre(h, 10, 23);
    h.world.run(1);
    const first = h.trader.id;
    h.world.engine.store.requestDelete(first);
    h.world.run(1);
    const service = getTradeService(h.world.engine);
    service.putVisit({
      traderPrototypeId,
      nextArrivalTick: h.world.engine.time.tickCount + 50,
      entityId: null,
    });
    for (let block = 0; block < 10; block += 1) {
      h.world.run(500);
      expect(creditMilli(h.world)).toBe(5000);
    }
    expect(h.world.engine.time.tickCount).toBeGreaterThan(5000);
    // A caravan came and went meanwhile; wait for one that is at the market now.
    for (
      let guard = 0;
      guard < 2500 && presentTrader(h.world.engine, traderPrototypeId) === null;
      guard += 5
    ) {
      h.world.run(5);
    }
    const returned = presentTrader(h.world.engine, traderPrototypeId);
    expect(returned).not.toBeNull();
    expect(returned?.id).not.toBe(first);
    expect(getTotal(returned as Entity, "iron_ingot")).toBe(5);
    expect(creditMilli(h.world)).toBe(5000);
    const buyer = h.world.settler(5);
    h.world.give(buyer, "silver_penny", 200);
    h.world.command("ProposeTrade", {
      buyerId: buyer.id,
      sellerId: (returned as Entity).id,
      requested: ingot(5),
      offeredCoins: 100,
    });
    h.world.run(1);
    expect(getTotal(buyer, "iron_ingot")).toBe(5);
    expect(creditMilli(h.world)).toBe(0);
  });

  it("the credit is part of the save and identical after a load", () => {
    const h = hamlet();
    sellOre(h, 7, 16);
    const save = h.world.engine.saveGame();
    const other = new GameEngine(loadContent(), { entropy: () => 1 });
    other.loadGame(save);
    expect(other.getStateHash()).toBe(h.world.engine.getStateHash());
    const original = getTradeService(h.world.engine).ledger();
    expect(getTradeService(other).ledger()).toEqual(original);
    expect(original[0]?.creditMilli).toBe(3500);
  });
});

describe("save and load in the middle of a negotiation", () => {
  it("a countered offer survives a load and completes identically", () => {
    const world = createTradeWorld({ seed: 33 });
    const trader = world.trader(3);
    const settler = world.settler(4);
    world.give(settler, "silver_penny", 40);
    world.command("ProposeTrade", {
      buyerId: settler.id,
      sellerId: trader.id,
      requested: [{ materialId: "nails", quantity: 10 }],
      offeredCoins: 2,
    });
    world.run(1);
    expect(world.query("trade-offers")).toMatchObject([{ status: "Countered", counterCoins: 3 }]);
    const save = world.engine.saveGame();
    const other = new GameEngine(loadContent(), { entropy: () => 1 });
    other.loadGame(save);
    expect(other.getStateHash()).toBe(world.engine.getStateHash());
    for (const engine of [world.engine, other]) {
      const registration = engine.getCommandHandler("AcceptTradeCounter");
      registration?.handler({ offerId: 1 }, engine);
      engine.runTicks(2);
    }
    expect(other.getStateHash()).toBe(world.engine.getStateHash());
    expect(getTotal(settler, "nails")).toBe(10);
    expect(world.query("trade-offers")).toEqual([]);
  });

  it("a pending offer loaded from a save still times out", () => {
    const world = createTradeWorld({ seed: 34 });
    const trader = world.trader(3);
    const settler = world.settler(4);
    world.command("ProposeTrade", {
      buyerId: settler.id,
      sellerId: trader.id,
      requested: [{ materialId: "coal", quantity: 1 }],
      offeredCoins: 0,
    });
    world.run(1);
    const other = new GameEngine(loadContent(), { entropy: () => 1 });
    other.loadGame(world.engine.saveGame());
    other.runTicks(30);
    expect(getTradeService(other).offers()).toEqual([]);
  });
});

// A tiny deterministic generator for the random-trading test (no Math.random in the repo).
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

const traded = [
  "nails",
  "coal",
  "iron_hammer",
  "iron_ore",
  "limestone",
  "oak_log",
  "wheat",
  "iron_ingot",
];

function settlementTotal(world: TradeTestWorld, materialId: string): number {
  return world.engine.store
    .entities()
    .filter(
      (entity) =>
        hasComponent(entity, inventoryComponent) && !hasComponent(entity, traderComponent),
    )
    .reduce((sum, entity) => sum + getTotal(entity, materialId), 0);
}

describe("conservation over 2000 ticks of random trading", () => {
  it("goods and coins only change hands through trades, nothing appears or vanishes", () => {
    const world = createTradeWorld({ seed: 77 });
    world.chest(34);
    for (const cell of [36, 37, 45]) {
      const settler = world.spawn("peasant", cell);
      world.give(settler, "bread", 4);
    }
    const flagged = world.settler(46);
    world.give(flagged, "iron_ore", 30);
    world.give(flagged, "silver_penny", 100);
    world.command("SetSellsItems", { entityId: flagged.id, value: true });
    world.give(world.chest(56), "iron_ore", 25);
    world.give(world.chest(57), "limestone", 20);
    getTradeService(world.engine).putVisit({
      traderPrototypeId,
      nextArrivalTick: 20,
      entityId: null,
    });
    const initial = new Map(traded.map((id) => [id, settlementTotal(world, id)]));
    const coinsBefore = settlementTotal(world, "silver_penny");
    const delta = new Map<string, number>();
    world.engine.bus.subscribe("trade.completed", (payload: JsonValue) => {
      const event = payload as unknown as {
        buyerId: number;
        sellerId: number;
        items: { materialId: string; quantity: number }[];
        payment: { materialId: string; quantity: number }[];
      };
      const buyerIsTrader =
        world.engine.store.get(event.buyerId)?.components["Trader"] !== undefined;
      const sellerIsTrader =
        world.engine.store.get(event.sellerId)?.components["Trader"] !== undefined;
      if (buyerIsTrader === sellerIsTrader) {
        return;
      }
      for (const item of event.items) {
        delta.set(
          item.materialId,
          (delta.get(item.materialId) ?? 0) + (buyerIsTrader ? -item.quantity : item.quantity),
        );
      }
      for (const item of event.payment) {
        delta.set(
          item.materialId,
          (delta.get(item.materialId) ?? 0) + (buyerIsTrader ? item.quantity : -item.quantity),
        );
      }
    });
    const mismatches: string[] = [];
    const next = lcg(2024);
    let completed = 0;
    world.engine.bus.subscribe("trade.completed", () => {
      completed += 1;
    });
    for (let tick = 0; tick < 2000; tick += 1) {
      if (tick % 9 === 0) {
        const trader = presentTrader(world.engine, traderPrototypeId);
        const choice = next() % 6;
        const material = traded[next() % traded.length] ?? "nails";
        const quantity = 1 + (next() % 8);
        try {
          if (trader !== null && choice === 0) {
            world.command("TradeSell", { traderId: trader.id, materialId: material, quantity });
          } else if (trader !== null && choice === 1) {
            world.command("TradeBuy", { traderId: trader.id, materialId: material, quantity });
          } else if (trader !== null && choice === 2) {
            world.command("ProposeTrade", {
              buyerId: flagged.id,
              sellerId: trader.id,
              requested: [{ materialId: material, quantity }],
              offeredCoins: next() % 30,
              offeredItems:
                next() % 2 === 0 ? [] : [{ materialId: "iron_ore", quantity: 1 + (next() % 3) }],
            });
          } else if (trader !== null && choice === 3) {
            world.command("ProposeTrade", {
              buyerId: trader.id,
              sellerId: flagged.id,
              requested: ore(quantity),
              offeredCoins: next() % 40,
            });
          } else if (choice === 4) {
            world.command("WithdrawTradeOffer", { offerId: 1 + (next() % 20) });
          } else if (choice === 5) {
            world.command("AcceptTradeCounter", { offerId: 1 + (next() % 20) });
          }
        } catch {
          // Refused commands are part of the random mix.
        }
      }
      if (tick % 40 === 0) {
        // Keep the settlers alive: a dead settler would take its goods out of the world.
        for (const entity of world.engine.store.entities()) {
          for (const value of getComponent(entity, needsComponent)?.values ?? []) {
            value.valueMilli = maxMeterMilli;
          }
        }
      }
      world.run(1);
      if (tick % 50 === 0 || tick === 1999) {
        for (const id of [...traded, "silver_penny"]) {
          const base = id === "silver_penny" ? coinsBefore : (initial.get(id) ?? 0);
          const change = settlementTotal(world, id) - base;
          if (change !== (delta.get(id) ?? 0)) {
            mismatches.push(
              `tick ${tick} ${id}: total moved ${change}, trades say ${delta.get(id) ?? 0}`,
            );
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(completed).toBeGreaterThan(3);
    expect(world.query("treasury")).toMatchObject({ pendingWages: [] });
  });
});

describe("trader visits are deterministic (stream trade.visit)", () => {
  function arrivals(seed: number): number[] {
    const engine = new GameEngine(loadContent(), { entropy: () => 1 });
    engine.newGame({ seed, mapSize: MapSize.Small });
    const ticks: number[] = [];
    engine.bus.subscribe(traderArrivedEvent, () => {
      ticks.push(engine.time.tickCount);
    });
    engine.runTicks(6 * ticksPerDay);
    return ticks;
  }

  it("the same seed gives the same arrival ticks, other seeds give other ones", () => {
    const first = arrivals(42);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first[0]).toBeGreaterThanOrEqual(3 * ticksPerDay);
    expect(arrivals(42)).toEqual(first);
    const others = [43, 44, 45].map((seed) => arrivals(seed)[0]);
    expect(new Set([first[0], ...others]).size).toBeGreaterThan(1);
  });
});

describe("wages come from the treasury (Checkpoint C economy)", () => {
  function totalCoins(session: GameSession): number {
    return session.engine.store
      .entities()
      .filter((entity) => hasComponent(entity, inventoryComponent))
      .reduce((sum, entity) => sum + getTotal(entity, "silver_penny"), 0);
  }

  it("ten days of settlers working pay every wage and move coins without creating any", () => {
    const text = readFileSync(
      join(__dirname, "..", "..", "scenarios", "checkpoint-c.json"),
      "utf8",
    );
    const parsed = parseScenario(text);
    if (!parsed.ok) {
      throw new Error(parsed.issues.join("; "));
    }
    const fresh = new GameSession();
    fresh.dispatch({ kind: "new-game", options: { ...parsed.scenario.options, seed: 42 } });
    const before = totalCoins(fresh);
    const sessions: GameSession[] = [];
    const result = runScenario(parsed.scenario, {
      createSession: () => {
        const session = new GameSession();
        sessions.push(session);
        return session;
      },
    });
    expect(result.ok).toBe(true);
    const session = sessions[0] as GameSession;
    const treasury = session.query.run("treasury", {});
    expect(treasury.ok && treasury.data).toMatchObject({ pendingWages: [] });
    expect(totalCoins(session)).toBe(before);
    const balance = treasury.ok ? (treasury.data as { balance: number }).balance : 0;
    expect(balance).toBeGreaterThan(900);
    expect(balance).toBeLessThan(1000);
  });
});
