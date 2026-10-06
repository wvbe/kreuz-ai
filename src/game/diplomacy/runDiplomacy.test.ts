import { describe, expect, it } from "vitest";
import { getStanding } from "../factions/factionStanding";
import { ticksPerDay } from "../time/GameTime";
import { isDecayTick, runDiplomacy } from "./runDiplomacy";
import { createDiplomacyWorld } from "./testDiplomacyWorld";

describe("isDecayTick", () => {
  it("is the first tick of every second day, never tick 0", () => {
    const world = createDiplomacyWorld();
    expect(isDecayTick(world.engine, 0)).toBe(false);
    expect(isDecayTick(world.engine, ticksPerDay)).toBe(false);
    expect(isDecayTick(world.engine, ticksPerDay * 2)).toBe(true);
    expect(isDecayTick(world.engine, ticksPerDay * 2 + 1)).toBe(false);
    expect(isDecayTick(world.engine, ticksPerDay * 3)).toBe(false);
    expect(isDecayTick(world.engine, ticksPerDay * 4)).toBe(true);
  });
});

describe("runDiplomacy", () => {
  it("decays every standing by one point on a decay tick and not before", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    runDiplomacy(world.engine, ticksPerDay * 2 - 1);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(25);
    runDiplomacy(world.engine, ticksPerDay * 2);
    expect(getStanding(world.engine, abbey, world.government).value).toBe(24);
    expect(getStanding(world.engine, world.government, abbey).value).toBe(19);
  });

  it("runs the slot-11 pass every tick of the engine: a deleted leader is replaced", () => {
    const world = createDiplomacyWorld();
    const abbey = world.npc("wulfric_abbey");
    const leader = (world.engine.store.require(abbey).components["Faction"] as { leaderId: number })
      .leaderId;
    world.engine.store.requestDelete(leader);
    world.run(3);
    const next = (world.engine.store.require(abbey).components["Faction"] as { leaderId: number })
      .leaderId;
    expect(next).not.toBeNull();
    expect(next).not.toBe(leader);
  });
});
