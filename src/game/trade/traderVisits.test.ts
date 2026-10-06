import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { positionComponent } from "../map/positionComponent";
import { findFactionByContentId, governmentFactionId } from "../factions/factionRegistry";
import { setStanding } from "../factions/factionStanding";
import { getTotal } from "../inventory/inventoryQueries";
import { ticksPerDay } from "../time/GameTime";
import { grantRefinedCredit } from "./refinedLedger";
import { createTradeWorld } from "./testTradeWorld";
import { getTradeService } from "./tradeServiceRegistry";
import { TraderPhase, traderArrivedEvent, traderLeftEvent, traderPrototypeId } from "./tradeTypes";
import { traderComponent } from "./traderComponent";
import {
  initTraderVisits,
  listTraders,
  marketCell,
  pickEntryCell,
  presentTrader,
  restockTrader,
  runTraderVisits,
  spawnTrader,
  traderPrototypeIds,
} from "./traderVisits";

describe("traderPrototypeIds and marketCell", () => {
  it("lists the prototypes with a Trader component", () => {
    const world = createTradeWorld();
    expect(traderPrototypeIds(world.engine)).toEqual([traderPrototypeId]);
  });

  it("is the cell of the first job board, and null without one", () => {
    const world = createTradeWorld({ boardCell: 12 });
    expect(marketCell(world.engine)).toEqual({ mapId: world.mapId, cellIndex: 12 });
    world.engine.store.requestDelete(world.boardId);
    world.engine.store.flushDeletions();
    expect(marketCell(world.engine)).toBeNull();
  });
});

describe("initTraderVisits (stream trade.visit)", () => {
  it("schedules the first arrival on the start day plus a jitter, the same for the same seed", () => {
    const first = createTradeWorld({ seed: 11 });
    const second = createTradeWorld({ seed: 11 });
    const constants = first.engine.content.constants;
    const tick = getTradeService(first.engine).visitOf(traderPrototypeId)?.nextArrivalTick ?? -1;
    expect(tick).toBeGreaterThanOrEqual(constants.traderVisitStartDay * ticksPerDay);
    expect(tick).toBeLessThanOrEqual(
      constants.traderVisitStartDay * ticksPerDay + constants.traderVisitJitterTicks,
    );
    expect(getTradeService(second.engine).visitOf(traderPrototypeId)?.nextArrivalTick).toBe(tick);
  });

  it("draws different jitters for different seeds", () => {
    const ticks = new Set<number>();
    for (let seed = 1; seed <= 8; seed += 1) {
      const world = createTradeWorld({ seed });
      ticks.add(getTradeService(world.engine).visitOf(traderPrototypeId)?.nextArrivalTick ?? -1);
    }
    expect(ticks.size).toBeGreaterThan(3);
  });

  it("can be called again and replaces the records", () => {
    const world = createTradeWorld();
    initTraderVisits(world.engine);
    expect(getTradeService(world.engine).visits()).toHaveLength(1);
  });
});

describe("restockTrader", () => {
  it("fills the purse and the goods it sells, and the stash of refined goods with credit", () => {
    const world = createTradeWorld();
    const trader = world.engine.store.spawn(traderPrototypeId, {
      Position: { mapId: world.mapId, cellIndex: 2 },
    });
    grantRefinedCredit(world.engine, trader, [{ materialId: "iron_ore", quantity: 6 }]);
    restockTrader(world.engine, trader);
    expect(world.coins(trader.id)).toBe(400);
    expect(getTotal(trader, "nails")).toBe(60);
    expect(getTotal(trader, "iron_hammer")).toBe(2);
    expect(getTotal(trader, "iron_ingot")).toBe(3);
    restockTrader(world.engine, world.settler(4));
  });
});

describe("pickEntryCell and spawnTrader", () => {
  it("enters far from the market, deterministically", () => {
    const first = createTradeWorld({ seed: 5 });
    const second = createTradeWorld({ seed: 5 });
    const market = marketCell(first.engine);
    expect(market).not.toBeNull();
    if (market === null) {
      return;
    }
    const cell = pickEntryCell(first.engine, market);
    expect(cell).toBe(pickEntryCell(second.engine, market));
    expect(cell).not.toBe(market.cellIndex);
    expect(cell).toBeGreaterThanOrEqual(0);
  });

  it("spawns a stocked caravan with the visit task and its faction", () => {
    const world = createTradeWorld();
    const trader = spawnTrader(world.engine, traderPrototypeId);
    expect(trader).not.toBeNull();
    if (trader === null) {
      return;
    }
    const data = getComponent(trader, traderComponent);
    expect(data?.phase).toBe(TraderPhase.Arriving);
    expect(data?.factionId).toBe(findFactionByContentId(world.engine, "merchant_caravans")?.id);
    expect(world.engine.tasks.getQueue(trader.id)?.tasks.map((task) => task.type)).toEqual([
      "trader.visit",
    ]);
    expect(world.coins(trader.id)).toBe(400);
    const cell = getComponent(trader, positionComponent)?.cellIndex ?? -1;
    expect(world.engine.maps.queryCell(world.mapId, cell).occupants).toContain(trader.id);
  });

  it("sends nobody without a market", () => {
    const world = createTradeWorld();
    world.engine.store.requestDelete(world.boardId);
    world.engine.store.flushDeletions();
    expect(spawnTrader(world.engine, traderPrototypeId)).toBeNull();
  });
});

describe("listTraders and presentTrader", () => {
  it("lists the live caravans and finds the one that is open for trade", () => {
    const world = createTradeWorld();
    expect(listTraders(world.engine)).toEqual([]);
    expect(presentTrader(world.engine, traderPrototypeId)).toBeNull();
    const trader = world.trader(3);
    expect(listTraders(world.engine).map((entity) => entity.id)).toEqual([trader.id]);
    expect(presentTrader(world.engine, traderPrototypeId)?.id).toBe(trader.id);
    const data = getComponent(trader, traderComponent);
    if (data !== undefined) {
      data.phase = TraderPhase.Leaving;
    }
    expect(presentTrader(world.engine, traderPrototypeId)).toBeNull();
    world.engine.store.requestDelete(trader.id);
    expect(listTraders(world.engine)).toEqual([]);
  });
});

describe("runTraderVisits: the visit cycle", () => {
  it("a caravan arrives on the schedule, stays two days, leaves and the next one is scheduled", () => {
    const world = createTradeWorld({ seed: 3 });
    const arrived = world.record(traderArrivedEvent);
    const left = world.record(traderLeftEvent);
    const constants = world.engine.content.constants;
    const service = getTradeService(world.engine);
    const first = service.visitOf(traderPrototypeId)?.nextArrivalTick ?? 0;
    world.run(first - 1);
    expect(listTraders(world.engine)).toEqual([]);
    world.run(1);
    expect(listTraders(world.engine)).toHaveLength(1);
    world.run(300);
    const present = presentTrader(world.engine, traderPrototypeId);
    expect(present).not.toBeNull();
    const data = present === null ? undefined : getComponent(present, traderComponent);
    expect(data?.departTick).toBe(
      (data?.arrivedTick ?? 0) + constants.traderStayDays * ticksPerDay,
    );
    expect(service.visitOf(traderPrototypeId)?.entityId).toBe(present?.id);
    world.run(constants.traderStayDays * ticksPerDay + 200);
    world.engine.bus.processQueue();
    expect(listTraders(world.engine)).toEqual([]);
    expect(arrived).toHaveLength(1);
    expect(left).toHaveLength(1);
    const next = service.visitOf(traderPrototypeId);
    expect(next?.entityId).toBeNull();
    expect(next?.nextArrivalTick).toBeGreaterThan(first + constants.traderStayDays * ticksPerDay);
    expect((next?.nextArrivalTick ?? 0) - engineTick(world)).toBeLessThanOrEqual(
      constants.traderVisitIntervalDays * ticksPerDay + constants.traderVisitJitterTicks,
    );
  });

  it("tries again a day later while the trader faction is hostile", () => {
    const world = createTradeWorld({ seed: 3 });
    const service = getTradeService(world.engine);
    const first = service.visitOf(traderPrototypeId)?.nextArrivalTick ?? 0;
    const faction = findFactionByContentId(world.engine, "merchant_caravans");
    expect(faction).toBeNull();
    world.run(first - 2);
    const spawned = world.engine.store.entities().length;
    // Pre-create the faction entity as hostile, then let the arrival tick pass.
    const created = world.engine.store.spawn("faction", {
      Faction: {
        contentId: "merchant_caravans",
        name: "Travelling merchants",
        factionType: "mercantile",
        leaderTitle: "Caravan master",
        disposition: "mercantile",
      },
    });
    setStanding(world.engine, created.id, governmentFactionId(world.engine) ?? 0, -50);
    world.run(3);
    expect(listTraders(world.engine)).toEqual([]);
    expect(world.engine.store.entities().length).toBe(spawned + 1);
    expect(service.visitOf(traderPrototypeId)?.nextArrivalTick).toBe(
      engineTick(world) - 1 + ticksPerDay,
    );
  });

  it("clears a record whose entity is gone", () => {
    const world = createTradeWorld();
    const service = getTradeService(world.engine);
    service.putVisit({ traderPrototypeId, nextArrivalTick: 1_000_000, entityId: 4242 });
    runTraderVisits(world.engine, 10);
    expect(service.visitOf(traderPrototypeId)?.entityId).toBeNull();
    expect(service.visitOf(traderPrototypeId)?.nextArrivalTick).toBeGreaterThan(
      10 + 5 * ticksPerDay,
    );
  });
});

function engineTick(world: { engine: { time: { tickCount: number } } }): number {
  return world.engine.time.tickCount;
}
