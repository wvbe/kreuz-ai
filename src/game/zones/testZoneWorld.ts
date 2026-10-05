import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import type { ContentRegistries } from "../content/ContentRegistries";
import type { Entity, EntityId } from "../ecs/Entity";
import { getComponent } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { getJobService } from "../jobs/jobServiceRegistry";
import { createStorageWorld } from "../storage/testStorageWorld";
import type { StorageTestWorld } from "../storage/testStorageWorld";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import { zoneComponent } from "./zoneComponent";
import type { ZoneData } from "./zoneTypes";

/**
 * One `zone.*` event seen by the test world.
 */
export type SeenZoneEvent = {
  name: string;
  payload: JsonValue;
};

/**
 * A storage test world (square map, 10x10 by default, board at cell 0) plus zone helpers.
 */
export type ZoneTestWorld = StorageTestWorld & {
  /**
   * Runs a registered command handler at once (commands are applied between ticks here).
   */
  command: (kind: string, payload: JsonValue) => JsonValue;
  /**
   * Designates zones from cells with the `DesignateZone` command; returns the new zone ids.
   */
  designate: (zoneTypeId: string, cells: number[], reassign?: boolean) => EntityId[];
  /**
   * The live data of a zone.
   */
  zoneData: (zoneId: EntityId) => ZoneData;
  /**
   * Spawns a furniture entity (`Furniture` + `Position`, no inventory) of a furniture content id.
   */
  furniture: (cell: number, furnitureId: string) => Entity;
  /**
   * Spawns a wall entity.
   */
  wall: (cell: number) => Entity;
  /**
   * Spawns a door entity.
   */
  door: (cell: number) => Entity;
  /**
   * Cells of a rectangle `columns x rows` whose top-left tile is `(column, row)`.
   */
  rect: (column: number, row: number, columns: number, rows: number) => number[];
  /**
   * Spawns walls on the ring around a rectangle (the tiles just outside it); the cells in
   * `except` stay free. Returns the wall entities by cell.
   */
  walls: (
    column: number,
    row: number,
    columns: number,
    rows: number,
    except?: number[],
  ) => Map<number, Entity>;
  /**
   * Sets the settlement tier that unlocks zone types (the world starts at `chartered_town`, so
   * every zone type can be designated).
   */
  setTier: (tier: string) => void;
  /**
   * Every `zone.*` event seen so far.
   */
  events: SeenZoneEvent[];
};

/**
 * The bundled content pack plus extra zone types (raw JSON records of `zones.json`), for tests of
 * requirements the shipped zone types do not use.
 *
 * @param extraZones - Zone type records to append.
 * @returns Fresh registries.
 */
export function contentWithZones(extraZones: JsonValue[]): ContentRegistries {
  const zones = bundledContentFiles[ContentFile.Zones];
  return loadContentPack({
    ...bundledContentFiles,
    [ContentFile.Zones]: [...(Array.isArray(zones) ? zones : []), ...extraZones],
  });
}

/**
 * Builds a {@link ZoneTestWorld}.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createZoneWorld(options: JobTestWorldOptions = {}): ZoneTestWorld {
  const world = createStorageWorld(options);
  const width = options.width ?? 10;
  const height = options.height ?? 10;
  getJobService(world.engine).setTierSource(() => "chartered_town");
  const events: SeenZoneEvent[] = [];
  world.engine.bus.subscribe("zone.**", (payload, event) => {
    events.push({ name: event.name, payload });
  });
  const command = (kind: string, payload: JsonValue): JsonValue => {
    const registration = world.engine.getCommandHandler(kind);
    if (registration === undefined) {
      throw new Error(`no command ${kind}`);
    }
    return registration.handler(payload, world.engine);
  };
  const rect = (column: number, row: number, columns: number, rows: number): number[] => {
    const cells: number[] = [];
    for (let y = row; y < row + rows; y += 1) {
      for (let x = column; x < column + columns; x += 1) {
        cells.push(y * width + x);
      }
    }
    return cells;
  };
  return {
    ...world,
    events,
    setTier: (tier) => getJobService(world.engine).setTierSource(() => tier),
    command,
    rect,
    designate: (zoneTypeId, cells, reassign = false) => {
      const result = command("DesignateZone", { zoneTypeId, mapId: world.mapId, cells, reassign });
      const ids = (result as { zoneIds: number[] }).zoneIds;
      return ids;
    },
    zoneData: (zoneId) => {
      const data = getComponent(world.engine.store.require(zoneId), zoneComponent);
      if (data === undefined) {
        throw new Error(`entity ${zoneId} is no zone`);
      }
      return data;
    },
    furniture: (cell, furnitureId) =>
      world.spawn("furniture_piece", cell, { Furniture: { furnitureId } }),
    wall: (cell) => world.spawn("wall", cell),
    door: (cell) => world.spawn("door", cell),
    walls: (column, row, columns, rows, except = []) => {
      const inside = new Set(rect(column, row, columns, rows));
      const placed = new Map<number, Entity>();
      for (let y = row - 1; y <= row + rows; y += 1) {
        for (let x = column - 1; x <= column + columns; x += 1) {
          const cell = y * width + x;
          if (
            x >= 0 &&
            y >= 0 &&
            x < width &&
            y < height &&
            !inside.has(cell) &&
            !except.includes(cell)
          ) {
            placed.set(cell, world.spawn("wall", cell));
          }
        }
      }
      return placed;
    },
  };
}
