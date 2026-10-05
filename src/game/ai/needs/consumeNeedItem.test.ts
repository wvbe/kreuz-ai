import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../engine/EventBus";
import { getTotal } from "../../inventory/inventoryQueries";
import { createAiWorld, removeItems } from "../testAiWorld";
import { consumeMoodMilli, consumeMoodTicks, consumeNeedItem } from "./consumeNeedItem";
import { adjustNeed, getNeedValue } from "./needAccess";

describe("consumeNeedItem", () => {
  it("takes one item, raises the need, adds a mood boost and emits need.item.consumed", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    adjustNeed(farmer, "hunger", -70_000);
    const consumed: JsonValue[] = [];
    world.engine.bus.subscribe("need.item.consumed", (payload) => consumed.push(payload));
    const ok = consumeNeedItem(world.engine, farmer, farmer, "hunger", "bread", 30_000, 10);
    world.engine.bus.processQueue();
    expect(ok).toBe(true);
    expect(getNeedValue(farmer, "hunger")).toBe(40_000);
    expect(getTotal(farmer, "bread")).toBe(1);
    expect(farmer.components["Mood"]).toEqual({
      valueMilli: 50_000,
      influences: [
        {
          source: "consumed_hunger",
          deltaMilli: consumeMoodMilli,
          untilTick: 10 + consumeMoodTicks,
        },
      ],
    });
    expect(consumed).toEqual([
      { entityId: farmer.id, needId: "hunger", materialId: "bread", quantity: 1 },
    ]);
  });

  it("caps the need at 100 percent", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    adjustNeed(farmer, "hunger", 15_000);
    consumeNeedItem(world.engine, farmer, farmer, "hunger", "bread", 30_000, 1);
    expect(getNeedValue(farmer, "hunger")).toBe(100_000);
  });

  it("can consume from another holder's inventory", () => {
    const world = createAiWorld();
    const hungry = world.spawn("peasant", 0);
    const baker = world.spawn("baker", 1);
    adjustNeed(hungry, "hunger", -60_000);
    expect(consumeNeedItem(world.engine, hungry, baker, "hunger", "bread", 30_000, 1)).toBe(true);
    expect(getTotal(baker, "bread")).toBe(1);
    expect(getNeedValue(hungry, "hunger")).toBe(50_000);
  });

  it("changes nothing when the holder lacks the item or has no inventory", () => {
    const world = createAiWorld();
    const farmer = world.spawn("farmer", 0);
    removeItems(world, farmer.id, "bread");
    const empty = world.engine.store.require(farmer.id);
    const before = getNeedValue(empty, "hunger");
    expect(consumeNeedItem(world.engine, empty, empty, "hunger", "bread", 30_000, 1)).toBe(false);
    const board = world.engine.store.spawn("job_board");
    expect(consumeNeedItem(world.engine, empty, board, "hunger", "bread", 30_000, 1)).toBe(false);
    expect(getNeedValue(empty, "hunger")).toBe(before);
  });
});
