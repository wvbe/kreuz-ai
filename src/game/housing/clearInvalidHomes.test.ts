import { describe, expect, it } from "vitest";
import { leaveFaction } from "../factions/factionMembership";
import { governmentFactionId } from "../factions/factionRegistry";
import { clearInvalidHomes } from "./clearInvalidHomes";
import { assignHome } from "./household";
import { createHousingWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

describe("clearInvalidHomes", () => {
  it("clears the home of a citizen who left the player faction (D-28)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const [stays, leaves] = [world.settler(170), world.settler(171)];
    assignHome(world.engine, stays.id, zone, 0);
    assignHome(world.engine, leaves.id, zone, 0);
    leaveFaction(world.engine, leaves.id, governmentFactionId(world.engine) ?? 0);
    expect(clearInvalidHomes(world.engine)).toEqual([leaves.id]);
    expect(world.residents(zone)).toEqual([stays.id]);
  });

  it("clears homes whose dwelling is gone and keeps the others", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const settler = world.settler(170);
    assignHome(world.engine, settler.id, zone, 0);
    expect(clearInvalidHomes(world.engine)).toEqual([]);
    world.engine.store.removeComponent(zone, { name: "Dwelling" });
    expect(clearInvalidHomes(world.engine)).toEqual([settler.id]);
  });

  it("keeps a home whose dwelling is only flagged for deletion this tick", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const settler = world.settler(170);
    assignHome(world.engine, settler.id, zone, 0);
    world.engine.store.requestDelete(zone);
    expect(clearInvalidHomes(world.engine)).toEqual([]);
  });
});
