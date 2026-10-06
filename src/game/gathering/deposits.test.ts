import type { JsonValue } from "../engine/EventBus";
import { describe, expect, it } from "vitest";
import { chargesLeft, depositCharges, takeCharge } from "./deposits";
import { getGatheringService } from "./gatheringServiceRegistry";
import { depositDepletedEvent } from "./gatheringTypes";
import { createGatheringWorld } from "./testGatheringWorld";

describe("depositCharges", () => {
  it("reads the content constants per deposit terrain", () => {
    const { engine } = createGatheringWorld();
    expect(depositCharges(engine, "iron_ore_deposit")).toBe(
      engine.content.constants.oreDepositCharges,
    );
    expect(depositCharges(engine, "stone_deposit")).toBe(
      engine.content.constants.stoneDepositCharges,
    );
    expect(depositCharges(engine, "grassland")).toBeNull();
  });
});

describe("chargesLeft", () => {
  it("is the full charge of an untouched deposit and 0 elsewhere", () => {
    const world = createGatheringWorld();
    world.terrain(12, "iron_ore_deposit");
    expect(chargesLeft(world.engine, world.mapId, 12)).toBe(6);
    expect(chargesLeft(world.engine, world.mapId, 13)).toBe(0);
    expect(chargesLeft(world.engine, 99, 12)).toBe(0);
  });
});

describe("takeCharge", () => {
  it("makes mining finite: after the last charge the deposit is gone", () => {
    const world = createGatheringWorld();
    const seen: JsonValue[] = [];
    world.engine.bus.subscribe(depositDepletedEvent, (payload) => seen.push(payload));
    world.terrain(12, "iron_ore_deposit");
    const map = world.engine.maps.require(world.mapId);
    for (let charge = 1; charge <= 6; charge += 1) {
      expect(map.terrainAt(12)).toBe("iron_ore_deposit");
      expect(takeCharge(world.engine, world.mapId, 12)).toBe(true);
      expect(chargesLeft(world.engine, world.mapId, 12)).toBe(charge < 6 ? 6 - charge : 0);
    }
    expect(map.terrainAt(12)).toBe("cave_floor");
    expect(getGatheringService(world.engine).deposits()).toEqual([]);
    expect(takeCharge(world.engine, world.mapId, 12)).toBe(false);
    world.run(1);
    expect(seen).toEqual([{ mapId: world.mapId, cellIndex: 12, terrainId: "cave_floor" }]);
  });

  it("refuses a cell that is no deposit and a missing map", () => {
    const world = createGatheringWorld();
    expect(takeCharge(world.engine, world.mapId, 3)).toBe(false);
    expect(takeCharge(world.engine, 99, 3)).toBe(false);
  });
});
