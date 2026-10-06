import { describe, expect, it } from "vitest";
import { ticksPerDay } from "../time/GameTime";
import { asRecords, contentWithLevels, createHousingWorld } from "./testHousingWorld";

describe("createHousingWorld", () => {
  it("builds a walled dwelling that is active and has its Dwelling state", () => {
    const world = createHousingWorld();
    const zone = world.dwelling(2, 2, { beds: 2 });
    expect(world.tiles(zone)).toHaveLength(4);
    expect(world.dwellingData(zone).level).toBe("hovel");
    world.setLevel(zone, "cottage" as never);
    expect(world.dwellingData(zone).level).toBe("cottage");
  });

  it("builds a throne room as the seat of government", () => {
    const world = createHousingWorld({ width: 16, height: 12 });
    const zone = world.throneRoom(8, 4);
    expect(world.tiles(zone)).toHaveLength(9);
    expect(world.rect(0, 0, 2, 2)).toEqual([0, 1, 16, 17]);
  });

  it("runs to the evaluation tick of the day, counting evaluations", () => {
    const world = createHousingWorld();
    world.runEvaluations(2);
    expect(world.engine.time.tickCount).toBe(ticksPerDay + 72);
    expect(world.residents(1)).toEqual([]);
  });

  it("gives test settlers no needs and reads query results as records", () => {
    const world = createHousingWorld();
    const settler = world.settler(95);
    expect(settler.components["Needs"]).toBeUndefined();
    expect(asRecords(world.query("dwellings"))).toEqual([]);
    expect(asRecords(null)).toEqual([]);
  });

  it("patches dwelling levels in a content pack", () => {
    const content = contentWithLevels({ hovel: { rentPerDay: 4 }, cottage: { unlockTier: null } });
    expect(content.dwellingLevels.require("hovel").rentPerDay).toBe(4);
    expect(content.dwellingLevels.require("cottage").unlockTier).toBeUndefined();
  });
});
