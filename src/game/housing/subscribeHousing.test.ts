import { describe, expect, it } from "vitest";
import { needItemConsumedEvent } from "../ai/aiTypes";
import { DwellingLevel } from "../content/contentTypes";
import { toDay } from "../time/GameTime";
import { dwellingComponent } from "./dwellingComponent";
import { assignHome } from "./household";
import { getHousingService } from "./housingServiceRegistry";
import { foodCategory } from "./subscribeHousing";
import { createHousingWorld } from "./testHousingWorld";

const options = { width: 24, height: 12 };

describe("subscribeHousing", () => {
  it("records the food a resident ate in the household, only for citizens with a home (FR-018)", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const [resident, drifter] = [world.settler(250), world.settler(251)];
    assignHome(world.engine, resident.id, zone, 0);
    const eat = (entityId: number, materialId: string): void => {
      world.engine.bus.emit(needItemConsumedEvent, {
        entityId,
        needId: "hunger",
        materialId,
        quantity: 1,
      });
      world.run(1);
    };
    eat(resident.id, "bread");
    eat(resident.id, "wheat");
    eat(resident.id, "iron_ore");
    eat(drifter.id, "flour");
    expect(foodCategory).toBe("food");
    expect(world.dwellingData(zone).foodRecord).toEqual({
      bread: toDay(world.engine.time.tickCount),
      wheat: toDay(world.engine.time.tickCount),
    });
  });

  it("keeps the level and resets the streaks of both parts when a zone splits", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { columns: 5, rows: 1, beds: 2 });
    world.setLevel(zone, DwellingLevel.Cottage);
    world.dwellingData(zone).upgradeStreak = 2;
    const [first, second] = [world.settler(250), world.settler(251)];
    assignHome(world.engine, first.id, zone, 1);
    assignHome(world.engine, second.id, zone, 2);
    const evicted = world.record("housing.resident.evicted");
    // Cutting out the middle tile splits the dwelling in two; the beds sit on the first two tiles.
    world.command("RemoveZoneTiles", { zoneId: zone, cells: [world.tiles(zone)[2] as number] });
    world.run(1);
    const parts = world.engine.store
      .entities()
      .filter((entity) => entity.components["Dwelling"] !== undefined)
      .map((entity) => entity.id);
    expect(parts).toHaveLength(2);
    for (const id of parts) {
      expect(world.dwellingData(id)).toMatchObject({ level: "cottage", upgradeStreak: 0 });
    }
    expect(evicted).toEqual([]);
  });

  it("evicts residents beyond the remaining capacity after a split with DwellingChanged", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { columns: 5, rows: 1, beds: 1 });
    // The second bed stands on the far part, which leaves with the split.
    world.furniture(world.tiles(zone)[4] as number, "wooden_bed");
    const [first, second] = [world.settler(250), world.settler(251)];
    assignHome(world.engine, first.id, zone, 1);
    assignHome(world.engine, second.id, zone, 2);
    const evicted = world.record("housing.resident.evicted");
    world.command("RemoveZoneTiles", { zoneId: zone, cells: [world.tiles(zone)[2] as number] });
    world.run(1);
    expect(evicted).toEqual([{ dwellingId: zone, entityId: second.id, reason: "DwellingChanged" }]);
    expect(world.residents(zone)).toEqual([first.id]);
  });

  it("takes the lower level and keeps residents by assignment tick when zones merge", () => {
    const world = createHousingWorld(options);
    const first = world.dwelling(2, 2, { beds: 2 });
    const second = world.dwelling(2, 6, { beds: 2 });
    world.setLevel(first, DwellingLevel.Cottage);
    const people = [world.settler(250), world.settler(251), world.settler(252)];
    assignHome(world.engine, people[0]?.id ?? 0, first, 10);
    assignHome(world.engine, people[1]?.id ?? 0, second, 5);
    assignHome(world.engine, people[2]?.id ?? 0, second, 6);
    // The merged zone has two beds on its first row only when the tiles are joined: use the zone
    // service directly, like the confirmed merge offer does.
    world.engine.bus.emit("zone.merged", { survivorId: first, absorbedId: second });
    getHousingService(world.engine).retire(second, DwellingLevel.Hovel);
    world.run(1);
    expect(world.dwellingData(first).level).toBe("hovel");
    expect(world.residents(first)).toEqual([people[1]?.id, people[2]?.id]);
    expect(world.residents(second)).toEqual([]);
  });

  it("evicts every resident with DwellingRemoved when a dwelling is deleted", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 2 });
    const [first, second] = [world.settler(250), world.settler(251)];
    assignHome(world.engine, first.id, zone, 1);
    assignHome(world.engine, second.id, zone, 2);
    const evicted = world.record("housing.resident.evicted");
    world.command("DeleteZone", { zoneId: zone });
    world.run(2);
    expect(evicted).toEqual([
      { dwellingId: zone, entityId: first.id, reason: "DwellingRemoved" },
      { dwellingId: zone, entityId: second.id, reason: "DwellingRemoved" },
    ]);
    expect(world.engine.store.has(zone)).toBe(false);
    expect(world.residents(zone)).toEqual([]);
  });

  it("remembers the level of a removed dwelling for the merge handler", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 1 });
    world.setLevel(zone, DwellingLevel.Cottage);
    world.engine.store.requestDelete(zone);
    world.run(1);
    expect(getHousingService(world.engine).retiredLevel(zone)).toBe("cottage");
    expect(dwellingComponent.name).toBe("Dwelling");
  });

  it("gives a dwelling zone its Dwelling state at zone.requirements.met", () => {
    const world = createHousingWorld(options);
    const zone = world.dwelling(2, 2, { beds: 1 });
    expect(world.dwellingData(zone).level).toBe("hovel");
  });
});
