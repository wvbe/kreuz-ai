import { describe, expect, it } from "vitest";
import { SeatSide } from "../content/contentTypes";
import { pickSeatCell, seatOf, travelTicks } from "./factionSeats";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

describe("pickSeatCell", () => {
  it("takes the extreme cell of a side, ties to the lowest index", () => {
    const world = createDiplomacyWorld();
    expect(pickSeatCell(world.engine, world.mapId, SeatSide.North)).toBe(0);
    expect(pickSeatCell(world.engine, world.mapId, SeatSide.West)).toBe(0);
    expect(pickSeatCell(world.engine, world.mapId, SeatSide.East)).toBe(9);
    expect(pickSeatCell(world.engine, world.mapId, SeatSide.South)).toBe(90);
  });
});

describe("seatOf", () => {
  it("is the market cell for the government and the stored cell for an NPC faction", () => {
    const world = createDiplomacyWorld();
    expect(seatOf(world.engine, world.government)).toEqual({ mapId: world.mapId, cellIndex: 55 });
    expect(seatOf(world.engine, world.npc("merchant_caravans"))).toEqual({
      mapId: world.mapId,
      cellIndex: 9,
    });
  });

  it("is null for a guild, a non-faction and a missing entity", () => {
    const world = createDiplomacyWorld();
    const guild = world.engine.store.spawn("faction", {
      Faction: { contentId: "guild_bakers", name: "Guild" },
    });
    expect(seatOf(world.engine, guild.id)).toBeNull();
    expect(seatOf(world.engine, world.boardId)).toBeNull();
    expect(seatOf(world.engine, 9999)).toBeNull();
  });
});

describe("travelTicks", () => {
  it("is the straight-line distance over envoyUnitsPerTick, rounded up", () => {
    const world = createDiplomacyWorld();
    // cell 55 is (5,5) and cell 0 is (0,0): 5 * sqrt(2) tiles = 7071 milli-tiles, 100 per tick
    expect(travelTicks(world.engine, world.government, world.npc("ashford_barony"))).toBe(71);
    // cell 9 is (9,0): sqrt(16 + 25) = 6403 milli-tiles
    expect(travelTicks(world.engine, world.government, world.npc("merchant_caravans"))).toBe(65);
  });

  it("is symmetric, at least 1 and null without a seat", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    expect(travelTicks(world.engine, abbey, world.government)).toBe(
      travelTicks(world.engine, world.government, abbey),
    );
    expect(travelTicks(world.engine, abbey, abbey)).toBe(1);
    const guild = world.engine.store.spawn("faction", {
      Faction: { contentId: "guild_bakers", name: "Guild" },
    });
    expect(travelTicks(world.engine, world.government, guild.id)).toBeNull();
  });
});
