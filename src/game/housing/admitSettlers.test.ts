import { describe, expect, it } from "vitest";
import { DwellingLevel } from "../content/contentTypes";
import { getComponent } from "../ecs/Entity";
import { citizenComponent } from "../factions/citizenComponent";
import { governmentFactionId } from "../factions/factionRegistry";
import { isMember } from "../factions/factionMembership";
import { identityComponent } from "../identity/identityComponent";
import { positionComponent } from "../map/positionComponent";
import { admitSettlers, spawnArrival } from "./admitSettlers";
import { listDwellings } from "./dwellingZones";
import { freeDwellings } from "./houseHomeless";
import { residentsByDwelling } from "./household";
import { createHousingWorld } from "./testHousingWorld";
import type { HousingTestWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

function free(world: HousingTestWorld) {
  return freeDwellings(
    world.engine,
    listDwellings(world.engine),
    residentsByDwelling(world.engine),
  );
}

describe("spawnArrival", () => {
  it("creates a named government member on the cell", () => {
    const world = createHousingWorld(options);
    const id = spawnArrival(world.engine, "peasant", world.mapId, 0);
    const entity = world.engine.store.require(id);
    expect(getComponent(entity, positionComponent)).toMatchObject({
      mapId: world.mapId,
      cellIndex: 0,
    });
    expect(isMember(world.engine, id, governmentFactionId(world.engine) ?? 0)).toBe(true);
    expect(getComponent(entity, identityComponent)?.givenName).not.toBe("");
  });
});

describe("admitSettlers", () => {
  it("lets min(slots, maxImmigrantsPerDay) settlers arrive at the arrival cell (FR-015)", () => {
    const world = createHousingWorld(options);
    world.throneRoom(10, 2);
    const zone = world.dwelling(2, 2, { columns: 3, rows: 2, beds: 4 });
    world.setLevel(zone, DwellingLevel.Cottage);
    const arrived = world.record("housing.immigrant.arrived");
    const ids = admitSettlers(world.engine, free(world), 50);
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(getComponent(world.engine.store.require(id), citizenComponent)).toMatchObject({
        homeDwellingId: zone,
        homeAssignedTick: 50,
      });
    }
    world.run(1);
    expect(arrived).toHaveLength(2);
  });

  it("brings nobody when nothing is free", () => {
    const world = createHousingWorld(options);
    world.throneRoom(10, 2);
    expect(admitSettlers(world.engine, [], 1)).toEqual([]);
  });

  it("says why nobody can come, once per call", () => {
    const world = createHousingWorld(options);
    world.dwelling(2, 2, { beds: 2 });
    const blocked = world.record("housing.immigration.blocked");
    expect(admitSettlers(world.engine, free(world), 1)).toEqual([]);
    world.run(1);
    expect(blocked).toEqual([{ reason: "NoSeatOfGovernment" }]);
  });

  it("draws the prototype of each settler from the level's weighted table", () => {
    const world = createHousingWorld(options);
    world.throneRoom(10, 2);
    world.dwelling(2, 2, { beds: 2 });
    const ids = admitSettlers(world.engine, free(world), 1);
    expect(ids.map((id) => world.engine.store.require(id).prototype)).toEqual([
      "peasant",
      "peasant",
    ]);
  });
});
