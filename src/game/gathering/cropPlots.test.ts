import type { JsonValue } from "../engine/EventBus";
import { describe, expect, it } from "vitest";
import {
  cropGrowthMilli,
  cropOfZoneType,
  cropStageAt,
  fertileCellsOf,
  fieldCellAt,
  growCrops,
  harvestCell,
  isWorkingField,
  sowCell,
} from "./cropPlots";
import { getGatheringService } from "./gatheringServiceRegistry";
import { CropStage, cropRipenedEvent } from "./gatheringTypes";
import { createGatheringWorld } from "./testGatheringWorld";

function ripen(world: ReturnType<typeof createGatheringWorld>): void {
  for (let tick = 0; tick < 864; tick += 1) {
    growCrops(world.engine);
  }
}

describe("cropOfZoneType", () => {
  it("is the first crop output of a field and null for other zones", () => {
    const world = createGatheringWorld();
    expect(cropOfZoneType(world.engine, "farm_field")).toEqual({
      materialId: "wheat",
      quantity: 4,
    });
    expect(cropOfZoneType(world.engine, "stockpile")).toBeNull();
    expect(cropOfZoneType(world.engine, "nope")).toBeNull();
  });
});

describe("cropGrowthMilli", () => {
  it("is cropGrowthTicks in milli-ticks", () => {
    expect(cropGrowthMilli(createGatheringWorld().engine)).toBe(864_000);
  });
});

describe("isWorkingField", () => {
  it("is true for an active field past its activation tick only", () => {
    const world = createGatheringWorld();
    const zoneId = world.field(world.rect(2, 2, 2, 2));
    expect(isWorkingField(world.engine, zoneId)).toBe(true);
    const [stock] = world.designate("stockpile", world.rect(6, 6, 2, 2));
    expect(isWorkingField(world.engine, stock ?? 0)).toBe(false);
    expect(isWorkingField(world.engine, 9999)).toBe(false);
  });

  it("is false for a field below the minimum size", () => {
    const world = createGatheringWorld();
    const zoneId = world.field([22, 23]);
    expect(isWorkingField(world.engine, zoneId)).toBe(false);
  });
});

describe("fertileCellsOf", () => {
  it("lists only the fertile tiles of the zone, ascending", () => {
    const world = createGatheringWorld();
    const cells = world.rect(2, 2, 3, 2);
    const zoneId = world.field(cells);
    world.terrain(23, "grassland");
    expect(fertileCellsOf(world.engine, zoneId)).toEqual([22, 24, 32, 33, 34]);
    expect(fertileCellsOf(world.engine, 9999)).toEqual([]);
  });
});

describe("fieldCellAt", () => {
  it("finds fertile cells of a working field and nothing else", () => {
    const world = createGatheringWorld();
    const zoneId = world.field(world.rect(2, 2, 2, 2));
    expect(fieldCellAt(world.engine, world.mapId, 22)).toEqual({
      zoneId,
      mapId: world.mapId,
      cellIndex: 22,
    });
    expect(fieldCellAt(world.engine, world.mapId, 80)).toBeNull();
    world.terrain(22, "grassland");
    expect(fieldCellAt(world.engine, world.mapId, 22)).toBeNull();
    expect(fieldCellAt(world.engine, 99, 22)).toBeNull();
  });

  it("is limited to fields: crops never grow on fertile soil in another zone", () => {
    const world = createGatheringWorld();
    world.terrain(60, "fertile_soil");
    world.designate("stockpile", world.rect(6, 6, 2, 2));
    world.run(2);
    expect(fieldCellAt(world.engine, world.mapId, 66)).toBeNull();
    expect(fieldCellAt(world.engine, world.mapId, 60)).toBeNull();
  });
});

describe("sowCell and harvestCell", () => {
  it("runs the crop lifecycle: fallow, sown, ripe after the growth time, fallow again", () => {
    const world = createGatheringWorld();
    world.field(world.rect(2, 2, 2, 2));
    const events: JsonValue[] = [];
    world.engine.bus.subscribe(cropRipenedEvent, (payload) => events.push(payload));
    expect(cropStageAt(world.engine, world.mapId, 22)).toBe(CropStage.Fallow);
    expect(harvestCell(world.engine, world.mapId, 22)).toBeNull();
    const plot = sowCell(world.engine, world.mapId, 22);
    expect(plot).toMatchObject({ materialId: "wheat", stage: CropStage.Sown, growthMilli: 0 });
    expect(sowCell(world.engine, world.mapId, 22)).toBeNull();
    for (let tick = 0; tick < 863; tick += 1) {
      growCrops(world.engine);
    }
    expect(cropStageAt(world.engine, world.mapId, 22)).toBe(CropStage.Sown);
    expect(harvestCell(world.engine, world.mapId, 22)).toBeNull();
    growCrops(world.engine);
    expect(cropStageAt(world.engine, world.mapId, 22)).toBe(CropStage.Ripe);
    world.engine.runTicks(1);
    expect(events).toEqual([{ mapId: world.mapId, cellIndex: 22, materialId: "wheat" }]);
    expect(harvestCell(world.engine, world.mapId, 22)).toMatchObject({ stage: CropStage.Ripe });
    expect(cropStageAt(world.engine, world.mapId, 22)).toBe(CropStage.Fallow);
  });

  it("refuses to sow outside a working field or on other soil", () => {
    const world = createGatheringWorld();
    world.field(world.rect(2, 2, 2, 2));
    expect(sowCell(world.engine, world.mapId, 80)).toBeNull();
    world.terrain(22, "grassland");
    expect(sowCell(world.engine, world.mapId, 22)).toBeNull();
  });
});

describe("growCrops", () => {
  it("drops plots whose field is gone and keeps ripe plots ripe", () => {
    const world = createGatheringWorld();
    const zoneId = world.field(world.rect(2, 2, 2, 2));
    sowCell(world.engine, world.mapId, 22);
    sowCell(world.engine, world.mapId, 23);
    ripen(world);
    expect(cropStageAt(world.engine, world.mapId, 23)).toBe(CropStage.Ripe);
    growCrops(world.engine);
    expect(cropStageAt(world.engine, world.mapId, 23)).toBe(CropStage.Ripe);
    world.command("DeleteZone", { zoneId });
    world.run(1);
    growCrops(world.engine);
    expect(getGatheringService(world.engine).plots()).toEqual([]);
  });

  it("does not grow a plot while its field is not working", () => {
    const world = createGatheringWorld();
    const zoneId = world.field(world.rect(2, 2, 2, 2));
    sowCell(world.engine, world.mapId, 22);
    world.command("RemoveZoneTiles", { zoneId, cells: [23, 32, 33] });
    world.run(2);
    growCrops(world.engine);
    expect(getGatheringService(world.engine).plotAt(world.mapId, 22)?.growthMilli).toBe(0);
  });
});
