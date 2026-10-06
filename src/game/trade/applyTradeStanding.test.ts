import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { governmentFactionId } from "../factions/factionRegistry";
import { getStanding } from "../factions/factionStanding";
import { createTradeWorld } from "./testTradeWorld";
import { applyTradeStanding } from "./applyTradeStanding";
import { traderComponent } from "./traderComponent";

describe("applyTradeStanding", () => {
  it("raises both views by one per trade, up to five per day, then starts again the next day", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    const government = governmentFactionId(world.engine) ?? 0;
    const faction = getComponent(trader, traderComponent)?.factionId ?? 0;
    expect(applyTradeStanding(world.engine, trader)).toBe(1);
    expect(getStanding(world.engine, faction, government).value).toBe(1);
    expect(getStanding(world.engine, government, faction).value).toBe(1);
    for (let trade = 0; trade < 4; trade += 1) {
      expect(applyTradeStanding(world.engine, trader)).toBe(1);
    }
    expect(applyTradeStanding(world.engine, trader)).toBe(0);
    expect(getStanding(world.engine, faction, government).value).toBe(5);
    world.run(world.engine.content.constants.traderVisitJitterTicks);
    world.run(300);
    expect(applyTradeStanding(world.engine, trader)).toBe(1);
    expect(getStanding(world.engine, faction, government).value).toBe(6);
  });

  it("does nothing for an entity that is not a trader", () => {
    const world = createTradeWorld();
    expect(applyTradeStanding(world.engine, world.settler(4))).toBe(0);
  });
});
