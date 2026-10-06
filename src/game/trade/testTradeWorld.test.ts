import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { governmentFactionId } from "../factions/factionRegistry";
import { isMember } from "../factions/factionMembership";
import { canStore, getTotal } from "../inventory/inventoryQueries";
import { traderComponent } from "./traderComponent";
import { createTradeWorld, fullInventory } from "./testTradeWorld";
import { TraderPhase } from "./tradeTypes";

describe("createTradeWorld", () => {
  it("starts with a funded treasury and spawns a present, stocked trader", () => {
    const world = createTradeWorld();
    expect(world.treasury()).toBe(world.engine.content.constants.startingTreasury);
    const trader = world.trader(3);
    const data = getComponent(trader, traderComponent);
    expect(data?.phase).toBe(TraderPhase.Present);
    expect(data?.factionId).toBeGreaterThan(0);
    expect(world.coins(trader.id)).toBe(data?.purseCoins);
    expect(getTotal(trader, "nails")).toBe(60);
  });

  it("makes settlers members of the government faction and records events", () => {
    const world = createTradeWorld();
    const seen = world.record("entity.spawned");
    const settler = world.settler(4);
    const government = governmentFactionId(world.engine);
    expect(government).not.toBeNull();
    expect(isMember(world.engine, settler.id, government ?? 0)).toBe(true);
    world.engine.bus.processQueue();
    expect(seen.at(-1)).toMatchObject({ prototypeId: "peasant" });
    expect(world.coins(settler.id)).toBe(0);
  });

  it("accepts trader component overrides", () => {
    const world = createTradeWorld();
    const trader = world.trader(3, { Trader: { purseCoins: 7 } });
    expect(world.coins(trader.id)).toBe(7);
  });

  it("runs registered commands and queries", () => {
    const world = createTradeWorld();
    const trader = world.trader(3);
    expect(world.command("SetSellsItems", { entityId: trader.id, value: false })).toEqual({
      entityId: trader.id,
      sellsItems: false,
    });
    expect(world.query("treasury")).toMatchObject({ balance: world.treasury() });
    expect(() => world.command("NoSuchCommand", {})).toThrow(/no command/);
    expect(() => world.query("no-such-query")).toThrow(/no query/);
  });
});

describe("fullInventory", () => {
  it("leaves no free slot: existing stacks grow, new materials do not fit", () => {
    const world = createTradeWorld();
    const settler = world.settler(4);
    world.give(settler, "silver_penny", 5);
    fullInventory(settler);
    expect(canStore(world.engine.materials, settler, "silver_penny", 5).fits).toBe(true);
    expect(canStore(world.engine.materials, settler, "coal", 1).fits).toBe(false);
  });
});
