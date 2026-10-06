import { describe, expect, it } from "vitest";
import { getComponent } from "../ecs/Entity";
import { dwellingComponent } from "./dwellingComponent";
import { ensureDwelling, ensureDwellings } from "./ensureDwellings";
import { createHousingWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

describe("ensureDwelling", () => {
  it("adds a Hovel state to an active dwelling zone once", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 1 });
    world.engine.store.removeComponent(zone, dwellingComponent);
    expect(ensureDwelling(world.engine, zone)).toBe(true);
    expect(getComponent(world.engine.store.require(zone), dwellingComponent)?.level).toBe("hovel");
    expect(ensureDwelling(world.engine, zone)).toBe(false);
  });

  it("leaves other zones and inactive dwellings alone (FR-001)", () => {
    const world = createHousingWorld(options);
    const stock = world.command("DesignateZone", {
      zoneTypeId: "stockpile",
      mapId: world.mapId,
      cells: [150],
      reassign: false,
    }) as { zoneIds: number[] };
    expect(ensureDwelling(world.engine, stock.zoneIds[0] ?? 0)).toBe(false);
    const open = world.command("DesignateZone", {
      zoneTypeId: "dwelling",
      mapId: world.mapId,
      cells: world.rect(8, 8, 2, 2),
      reassign: false,
    }) as { zoneIds: number[] };
    world.run(1);
    expect(ensureDwelling(world.engine, open.zoneIds[0] ?? 0)).toBe(false);
    expect(ensureDwelling(world.engine, 9999)).toBe(false);
  });
});

describe("ensureDwellings", () => {
  it("returns the zones that became dwellings, ascending", () => {
    const world = createHousingWorld({ width: 20, height: 12 });
    const first = world.dwelling(1, 2);
    const second = world.dwelling(6, 2);
    world.engine.store.removeComponent(second, dwellingComponent);
    world.engine.store.removeComponent(first, dwellingComponent);
    expect(ensureDwellings(world.engine)).toEqual([first, second]);
    expect(ensureDwellings(world.engine)).toEqual([]);
  });
});
