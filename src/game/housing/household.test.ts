import { describe, expect, it } from "vitest";
import { noAiOverride } from "../jobs/testJobWorld";
import {
  assignHome,
  clearHome,
  homelessCitizens,
  isEligibleResident,
  residentsByDwelling,
  residentsOf,
} from "./household";
import { createHousingWorld } from "./testHousingWorld";

describe("household", () => {
  it("houses only adult government members with a task queue (FR-005)", () => {
    const world = createHousingWorld();
    const member = world.settler(71);
    const outsider = world.spawn("peasant", 74, noAiOverride);
    const chest = world.chest(75);
    expect(isEligibleResident(world.engine, member)).toBe(true);
    expect(isEligibleResident(world.engine, outsider)).toBe(false);
    expect(isEligibleResident(world.engine, chest)).toBe(false);
  });

  it("derives households from Citizen.homeDwellingId", () => {
    const world = createHousingWorld();
    const zone = world.dwelling(2, 2, { beds: 2 });
    const [first, second, third] = [world.settler(71), world.settler(72), world.settler(73)];
    assignHome(world.engine, second?.id ?? 0, zone, 5);
    assignHome(world.engine, first?.id ?? 0, zone, 6);
    expect(residentsOf(world.engine, zone).map((entity) => entity.id)).toEqual([
      first?.id,
      second?.id,
    ]);
    expect(residentsByDwelling(world.engine).get(zone)?.length).toBe(2);
    expect(homelessCitizens(world.engine).map((entity) => entity.id)).toEqual([third?.id]);
  });

  it("assigns with the tick and emits one event, and clears again", () => {
    const world = createHousingWorld();
    const zone = world.dwelling(2, 2);
    const seen = world.record("housing.resident.assigned");
    const settler = world.settler(71);
    assignHome(world.engine, settler.id, zone, 77);
    world.run(1);
    expect(seen).toEqual([{ dwellingId: zone, entityId: settler.id }]);
    expect(settler.components["Citizen"]).toMatchObject({
      homeDwellingId: zone,
      homeAssignedTick: 77,
    });
    clearHome(world.engine, settler.id);
    expect(settler.components["Citizen"]).toMatchObject({
      homeDwellingId: null,
      homeAssignedTick: 0,
    });
  });
});
