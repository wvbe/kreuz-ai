import { describe, expect, it } from "vitest";
import { getJobService } from "../jobs/jobServiceRegistry";
import { ConstructionError, ConstructionErrorKind } from "./ConstructionError";
import { PlacementReasonKind } from "./constructionTypes";
import { assertPlacementValid, validatePlacement } from "./placement";
import { createConstructionWorld } from "./testConstructionWorld";
import { loadVillageBakeryContent } from "../content/loadVillageBakeryContent";

function kinds(world: ReturnType<typeof createConstructionWorld>, id: string, cell: number) {
  return validatePlacement(world.engine, id, world.mapId, cell).reasons.map(
    (reason) => reason.kind,
  );
}

// @covers 016:FR-016 016:FR-017
describe("validatePlacement", () => {
  it("accepts a free buildable cell", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const result = validatePlacement(world.engine, "chest", world.mapId, 44);
    expect(result).toMatchObject({
      valid: true,
      reasons: [],
      prototypeId: "chest",
      cellIndex: 44,
      zoneId: null,
      unlockTier: "hamlet",
    });
  });

  it("refuses a missing map and cells outside the map", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    expect(validatePlacement(world.engine, "chest", 99, 0).reasons[0]?.kind).toBe(
      PlacementReasonKind.UnknownMap,
    );
    expect(kinds(world, "chest", 100)).toEqual([PlacementReasonKind.OutOfBounds]);
    expect(kinds(world, "chest", -1)).toEqual([PlacementReasonKind.OutOfBounds]);
  });

  it("refuses an unknown definition", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const result = validatePlacement(world.engine, "castle", world.mapId, 44);
    expect(result.valid).toBe(false);
    expect(result.unlockTier).toBeNull();
    expect(result.reasons.map((reason) => reason.kind)).toEqual([
      PlacementReasonKind.UnknownPrototype,
    ]);
  });

  it("refuses a tier-locked definition with the unlock text", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    getJobService(world.engine).setTierSource(() => "hamlet");
    const result = validatePlacement(world.engine, "oven", world.mapId, 44);
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual([
      {
        kind: PlacementReasonKind.TierLocked,
        text: "Unlocks at Village",
        params: { unlockTier: "village" },
      },
    ]);
    expect(result.unlockTier).toBe("village");
  });

  it("refuses terrain that is not buildable", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    world.engine.maps.require(world.mapId).setTerrain(44, "water_shallow");
    world.forest(45);
    expect(kinds(world, "chest", 44)).toEqual([PlacementReasonKind.TerrainNotBuildable]);
    expect(kinds(world, "chest", 45)).toEqual([PlacementReasonKind.TerrainNotBuildable]);
  });

  it("refuses cells held by buildings, boards and blueprints but not by citizens", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    world.chest(20);
    world.wall(21);
    world.door(22);
    world.settler(23);
    const id = world.place("wall", 24);
    expect(kinds(world, "table", 20)).toEqual([PlacementReasonKind.Occupied]);
    expect(kinds(world, "table", 21)).toEqual([PlacementReasonKind.Occupied]);
    expect(kinds(world, "table", 22)).toEqual([PlacementReasonKind.Occupied]);
    expect(kinds(world, "table", 0)).toEqual([PlacementReasonKind.Occupied]);
    expect(kinds(world, "table", 23)).toEqual([]);
    const blueprint = validatePlacement(world.engine, "table", world.mapId, 24);
    expect(blueprint.reasons).toMatchObject([
      { kind: PlacementReasonKind.SiteExists, params: { jobId: id } },
    ]);
  });

  it("reports several reasons at once and the zone of the cell without refusing for it", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    getJobService(world.engine).setTierSource(() => "hamlet");
    world.chest(20);
    expect(kinds(world, "oven", 20)).toEqual([
      PlacementReasonKind.TierLocked,
      PlacementReasonKind.Occupied,
    ]);
    const [zoneId] = world.designate("stockpile", [33, 34]);
    const inZone = validatePlacement(world.engine, "table", world.mapId, 33);
    expect(inZone.valid).toBe(true);
    expect(inZone.zoneId).toBe(zoneId);
  });

  it("ignores entities that are flagged for deletion", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    const wall = world.wall(21);
    world.engine.store.requestDelete(wall.id);
    expect(kinds(world, "table", 21)).toEqual([]);
  });
});

describe("assertPlacementValid", () => {
  it("does nothing for a valid placement and throws the command error kind otherwise", () => {
    const world = createConstructionWorld({ content: loadVillageBakeryContent() });
    getJobService(world.engine).setTierSource(() => "hamlet");
    world.chest(20);
    world.engine.maps.require(world.mapId).setTerrain(44, "water_shallow");
    const kindOf = (id: string, cell: number): ConstructionErrorKind | null => {
      try {
        assertPlacementValid(validatePlacement(world.engine, id, world.mapId, cell));
        return null;
      } catch (error) {
        return error instanceof ConstructionError ? error.kind : null;
      }
    };
    expect(kindOf("chest", 30)).toBeNull();
    expect(kindOf("chest", 100)).toBe(ConstructionErrorKind.OutOfBounds);
    expect(kindOf("castle", 30)).toBe(ConstructionErrorKind.UnknownPrototype);
    expect(kindOf("oven", 30)).toBe(ConstructionErrorKind.ContentLocked);
    expect(kindOf("chest", 44)).toBe(ConstructionErrorKind.LocationBlocked);
    expect(kindOf("chest", 20)).toBe(ConstructionErrorKind.LocationAlreadyOccupied);
  });
});
