import { describe, expect, it } from "vitest";
import { dwellingOf } from "./dwellingZones";
import type { DwellingRecord } from "./dwellingZones";
import { assignHome, residentsOf } from "./household";
import { fetchInProgress, householdShortfalls, planFetch } from "./householdDemand";
import { fetchTaskType } from "./housingTypes";
import { createHousingWorld } from "./testHousingWorld";

const options = { width: 16, height: 12 };

function recordOf(world: ReturnType<typeof createHousingWorld>, zone: number): DwellingRecord {
  const record = dwellingOf(world.engine, zone);
  if (record === null) {
    throw new Error("no dwelling");
  }
  return record;
}

describe("householdShortfalls", () => {
  it("wants householdStockDays days of demand and names the shortfall (US3.1)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const chest = world.chest(world.tiles(zone)[3] as number);
    const empty = householdShortfalls(world.engine, recordOf(world, zone), 2);
    // A Hovel demands the Cottage's bread: 0.5 x 2 residents x 2 days = 2 units.
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ inStock: 0, shortfall: 2 });
    world.give(chest, "bread", 1);
    expect(householdShortfalls(world.engine, recordOf(world, zone), 2)[0]).toMatchObject({
      inStock: 1,
      shortfall: 1,
    });
    world.give(chest, "bread", 1);
    expect(householdShortfalls(world.engine, recordOf(world, zone), 2)).toEqual([]);
  });

  it("rounds a fraction of a day's demand up to a whole unit (US3.2)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    expect(householdShortfalls(world.engine, recordOf(world, zone), 1)[0]?.shortfall).toBe(1);
  });

  it("wants nothing without residents, storage or an active dwelling (US3.4, US3.6)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    expect(householdShortfalls(world.engine, recordOf(world, zone), 2)).toEqual([]);
    world.chest(world.tiles(zone)[3] as number);
    expect(householdShortfalls(world.engine, recordOf(world, zone), 0)).toEqual([]);
  });
});

describe("fetchInProgress", () => {
  it("is true while a resident has a fetch task", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const settler = world.settler(170);
    assignHome(world.engine, settler.id, zone, 0);
    expect(fetchInProgress(residentsOf(world.engine, zone))).toBe(false);
    world.engine.tasks.enqueue(settler.id, {
      type: fetchTaskType,
      data: { dwellingId: zone, materialId: "bread", quantity: 1, sourceId: zone },
      priority: 50,
    });
    expect(fetchInProgress(residentsOf(world.engine, zone))).toBe(true);
  });
});

describe("planFetch", () => {
  it("takes the shortfall from the nearest storage outside the household (FR-016)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    world.chest(world.tiles(zone)[3] as number);
    const pantry = world.chest(170);
    world.give(pantry, "bread", 10);
    const settler = world.settler(171);
    assignHome(world.engine, settler.id, zone, 0);
    expect(planFetch(world.engine, settler)).toEqual({
      dwellingId: zone,
      materialId: "bread",
      quantity: 1,
      sourceId: pantry.id,
    });
  });

  it("finds nothing when the household stocks enough, has no source, or a fetch is under way", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const inside = world.chest(world.tiles(zone)[3] as number);
    const settler = world.settler(171);
    assignHome(world.engine, settler.id, zone, 0);
    // No source anywhere (US3.3).
    expect(planFetch(world.engine, settler)).toBeNull();
    world.give(inside, "bread", 5);
    const pantry = world.chest(170);
    world.give(pantry, "bread", 5);
    // Enough in the household's storage already.
    expect(planFetch(world.engine, settler)).toBeNull();
  });

  it("never uses the household's own storage as a source", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const [first, second] = [
      world.chest(world.tiles(zone)[2] as number),
      world.chest(world.tiles(zone)[3] as number),
    ];
    world.give(first, "bread", 1);
    const settler = world.settler(171);
    assignHome(world.engine, settler.id, zone, 0);
    expect(second.id).toBeGreaterThan(first.id);
    expect(planFetch(world.engine, settler)).toBeNull();
  });
});
