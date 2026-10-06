import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import type { ContentRegistries } from "../content/ContentRegistries";
import { ContentFile } from "../content/contentTypes";
import type { Entity, EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import { createZoneWorld } from "../zones/testZoneWorld";
import type { ZoneTestWorld } from "../zones/testZoneWorld";
import { farmFieldZoneTypeId, fertileTerrainId } from "./gatheringTypes";

/**
 * A zone test world (square map, 10x10 by default, board at cell 0) plus gathering helpers.
 */
export type GatheringTestWorld = ZoneTestWorld & {
  /**
   * Turns the cells into fertile soil, designates a `farm_field` zone over them and runs two ticks
   * so that the zone is active and its effects count. Returns the zone id.
   */
  field: (cells: number[]) => EntityId;
  /**
   * Sets the terrain of the cells, designates a zone of the type over them and runs two ticks so
   * that the zone is active and its effects count (`field` for any crop or dock zone). Returns
   * the zone id.
   */
  zoneOver: (zoneTypeId: string, cells: number[], terrainId: string) => EntityId;
  /**
   * Sets the terrain of a cell.
   */
  terrain: (cell: number, terrainId: string) => void;
  /**
   * Spawns a farmer (a settler whose AI claims jobs from the board) on a cell.
   */
  farmer: (cell: number) => Entity;
};

/**
 * Builds a {@link GatheringTestWorld}.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createGatheringWorld(options: JobTestWorldOptions = {}): GatheringTestWorld {
  const world = createZoneWorld(options);
  const terrain = (cell: number, terrainId: string): void => {
    world.engine.maps.require(world.mapId).setTerrain(cell, terrainId);
  };
  return {
    ...world,
    terrain,
    farmer: (cell) => world.spawn("farmer", cell),
    zoneOver: (zoneTypeId, cells, terrainId) => {
      for (const cell of cells) {
        terrain(cell, terrainId);
      }
      const [zoneId] = world.designate(zoneTypeId, cells);
      world.run(2);
      if (zoneId === undefined) {
        throw new Error(`no ${zoneTypeId} zone was designated`);
      }
      return zoneId;
    },
    field: (cells) => {
      for (const cell of cells) {
        terrain(cell, fertileTerrainId);
      }
      const [zoneId] = world.designate(farmFieldZoneTypeId, cells);
      world.run(2);
      if (zoneId === undefined) {
        throw new Error("no field zone was designated");
      }
      return zoneId;
    },
  };
}

/**
 * The bundled content pack with some content constants replaced (authored values, as in
 * `content-constants.json`), for tests of thresholds the shipped pack leaves at 0.
 *
 * @param overrides - Constant names and authored values.
 * @returns Fresh registries.
 */
export function contentWithConstants(overrides: { [name: string]: JsonValue }): ContentRegistries {
  const constants = bundledContentFiles[ContentFile.ContentConstants];
  return loadContentPack({
    ...bundledContentFiles,
    [ContentFile.ContentConstants]: {
      ...(constants as { [name: string]: JsonValue }),
      ...overrides,
    },
  });
}
