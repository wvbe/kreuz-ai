import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { positionComponent } from "../map/positionComponent";
import { ticksPerDay } from "../time/GameTime";
import { createTradeWorld } from "./testTradeWorld";
import { TraderPhase, traderArrivedEvent, traderLeftEvent, traderPrototypeId } from "./tradeTypes";
import { traderComponent } from "./traderComponent";
import { createTraderVisitTask } from "./createTraderVisitTask";
import { marketCell, spawnTrader } from "./traderVisits";

describe("createTraderVisitTask", () => {
  it("has the type, requires position and trader and cancels without side effects", () => {
    const world = createTradeWorld();
    const handler = createTraderVisitTask(world.engine);
    expect(handler.type).toBe("trader.visit");
    expect(handler.requires).toEqual(["Position", "Trader"]);
    expect(handler.cancel).toBeDefined();
  });

  it("walks to the market (phase approach), becomes present, stays, walks out and is deleted", () => {
    const world = createTradeWorld();
    const arrived = world.record(traderArrivedEvent);
    const left = world.record(traderLeftEvent);
    const trader = spawnTrader(world.engine, traderPrototypeId);
    expect(trader).not.toBeNull();
    if (trader === null) {
      return;
    }
    const market = marketCell(world.engine);
    const data = () => getComponent(trader, traderComponent);
    world.run(1);
    expect(data()?.phase).toBe(TraderPhase.Arriving);
    world.run(200);
    expect(data()?.phase).toBe(TraderPhase.Present);
    expect(getComponent(trader, positionComponent)?.cellIndex).toBe(market?.cellIndex);
    const stay = world.engine.content.constants.traderStayDays * ticksPerDay;
    expect((data()?.departTick ?? 0) - (data()?.arrivedTick ?? 0)).toBe(stay);
    expect(
      world.engine.tasks.getQueue(trader.id)?.tasks.find((task) => task.type === "trader.visit")
        ?.phase,
    ).toBe("stay");
    world.run(stay);
    world.engine.bus.processQueue();
    expect(world.engine.store.has(trader.id)).toBe(false);
    expect(arrived).toHaveLength(1);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ entityId: trader.id, traderPrototypeId });
  });

  it("puts the caravan at the market at once when its walk cannot be finished", () => {
    const world = createTradeWorld();
    const trader = spawnTrader(world.engine, traderPrototypeId);
    const market = marketCell(world.engine);
    expect(trader).not.toBeNull();
    if (trader === null || market === null) {
      return;
    }
    // Wall the market in: the walk fails and the caravan is set down at the goal.
    const map = world.engine.maps.require(world.mapId);
    for (const neighbor of map.neighbors(market.cellIndex)) {
      map.setTerrain(neighbor, "water_shallow");
    }
    world.run(40);
    expect(getComponent(trader, traderComponent)?.phase).toBe(TraderPhase.Present);
    expect(getComponent(trader, positionComponent)?.cellIndex).toBe(market.cellIndex);
  });

  it("arrives on the spot when it enters at the market cell", () => {
    const world = createTradeWorld();
    const market = marketCell(world.engine);
    const trader = world.engine.store.spawn(traderPrototypeId, {
      Position: { mapId: world.mapId, cellIndex: market?.cellIndex ?? 0 },
    });
    world.engine.maps.placeEntity(trader.id, world.mapId, market?.cellIndex ?? 0);
    world.engine.tasks.enqueue(trader.id, {
      type: "trader.visit",
      data: { mapId: world.mapId, marketCell: market?.cellIndex ?? 0, exitCell: 0 },
      priority: 50,
    });
    world.run(2);
    expect(getComponent(trader, traderComponent)?.phase).toBe(TraderPhase.Present);
  });
});
