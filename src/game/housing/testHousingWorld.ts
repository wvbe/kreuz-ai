import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import { ContentFile } from "../content/contentTypes";
import type { DwellingLevel } from "../content/contentTypes";
import type { ContentRegistries } from "../content/ContentRegistries";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { getJobService } from "../jobs/jobServiceRegistry";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import { createTradeWorld } from "../trade/testTradeWorld";
import type { TradeTestWorld } from "../trade/testTradeWorld";
import { ticksPerDay } from "../time/GameTime";
import { zoneComponent } from "../zones/zoneComponent";
import { dwellingComponent } from "./dwellingComponent";
import type { DwellingData } from "./housingTypes";

/**
 * A trade test world (square map, treasury, settlers who join the government) with the housing
 * helpers: walled rooms, dwellings, a throne room and day stepping.
 */
export type HousingTestWorld = TradeTestWorld & {
  /**
   * Map width in cells.
   */
  width: number;
  /**
   * Cells of a rectangle `columns x rows` whose top-left tile is `(column, row)`.
   */
  rect: (column: number, row: number, columns: number, rows: number) => number[];
  /**
   * Spawns walls on the ring around a rectangle and a door on the cell `doorCell` (which must be
   * on the ring).
   */
  room: (column: number, row: number, columns: number, rows: number, doorCell: number) => void;
  /**
   * Builds a walled dwelling room of `columns x rows` tiles with a door, `beds` wooden beds on its
   * first tiles, designates it and runs one tick so that it is active and has its `Dwelling`
   * component. Returns the zone id.
   */
  dwelling: (
    column: number,
    row: number,
    options?: { columns?: number; rows?: number; beds?: number },
  ) => EntityId;
  /**
   * Builds a 3x3 walled throne room with a table and designates it (the seat of government).
   * Returns the zone id.
   */
  throneRoom: (column: number, row: number) => EntityId;
  /**
   * Spawns a furniture entity (`Furniture` + `Position`) of a furniture content id.
   */
  furniture: (cell: number, furnitureId: string) => Entity;
  /**
   * Spawns a chest (storage furniture) on a cell.
   */
  household: (cell: number) => Entity;
  /**
   * The live `Dwelling` data of a zone.
   */
  dwellingData: (dwellingId: EntityId) => DwellingData;
  /**
   * Sets the level of a dwelling directly (no event, streaks untouched).
   */
  setLevel: (dwellingId: EntityId, level: DwellingLevel) => void;
  /**
   * Runs ticks until `tickOfDay` has been the housing evaluation slot `evaluations` times from now
   * (so the evaluation has just run).
   */
  runEvaluations: (evaluations: number) => void;
  /**
   * Settler ids whose home is the dwelling.
   */
  residents: (dwellingId: EntityId) => EntityId[];
  /**
   * The zone's tile cells.
   */
  tiles: (dwellingId: EntityId) => number[];
};

/**
 * Builds a {@link HousingTestWorld}.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createHousingWorld(options: JobTestWorldOptions = {}): HousingTestWorld {
  const world = createTradeWorld(options);
  const width = options.width ?? 10;
  getJobService(world.engine).setTierSource(() => "chartered_town");
  const rect = (column: number, row: number, columns: number, rows: number): number[] => {
    const cells: number[] = [];
    for (let y = row; y < row + rows; y += 1) {
      for (let x = column; x < column + columns; x += 1) {
        cells.push(y * width + x);
      }
    }
    return cells;
  };
  const room = (
    column: number,
    row: number,
    columns: number,
    rows: number,
    doorCell: number,
  ): void => {
    const inside = new Set(rect(column, row, columns, rows));
    for (let y = row - 1; y <= row + rows; y += 1) {
      for (let x = column - 1; x <= column + columns; x += 1) {
        const cell = y * width + x;
        if (inside.has(cell)) {
          continue;
        }
        // Only the four-neighbour ring encloses; the corners stay open.
        const corner =
          (x === column - 1 || x === column + columns) && (y === row - 1 || y === row + rows);
        if (corner) {
          continue;
        }
        world.spawn(cell === doorCell ? "door" : "wall", cell);
      }
    }
  };
  const furniture = (cell: number, furnitureId: string): Entity =>
    world.spawn("furniture_piece", cell, { Furniture: { furnitureId } });
  const dwellingData = (dwellingId: EntityId): DwellingData => {
    const data = getComponent(world.engine.store.require(dwellingId), dwellingComponent);
    if (data === undefined) {
      throw new Error(`entity ${dwellingId} has no Dwelling`);
    }
    return data;
  };
  return {
    ...world,
    // Test settlers need no food: housing tests run for many days with the AI switched off.
    settler: (cell) => {
      const settler = world.settler(cell);
      world.engine.store.removeComponent(settler.id, { name: "Needs" });
      return settler;
    },
    width,
    rect,
    room,
    furniture,
    household: (cell) => world.spawn("chest", cell, { Stockpile: { priority: 0, filter: null } }),
    dwellingData,
    setLevel: (dwellingId, level) => {
      dwellingData(dwellingId).level = level;
    },
    dwelling: (column, row, dwellingOptions = {}) => {
      const columns = dwellingOptions.columns ?? 2;
      const rows = dwellingOptions.rows ?? 2;
      const tiles = rect(column, row, columns, rows);
      room(column, row, columns, rows, (row - 1) * width + column);
      for (const cell of tiles.slice(0, dwellingOptions.beds ?? 1)) {
        furniture(cell, "wooden_bed");
      }
      const result = world.command("DesignateZone", {
        zoneTypeId: "dwelling",
        mapId: world.mapId,
        cells: tiles,
        reassign: false,
      }) as { zoneIds: number[] };
      world.run(1);
      return result.zoneIds[0] as number;
    },
    throneRoom: (column, row) => {
      const tiles = rect(column, row, 3, 3);
      room(column, row, 3, 3, (row - 1) * width + column + 1);
      furniture(tiles[4] as number, "table");
      const result = world.command("DesignateZone", {
        zoneTypeId: "throne_room",
        mapId: world.mapId,
        cells: tiles,
        reassign: false,
      }) as { zoneIds: number[] };
      world.run(1);
      return result.zoneIds[0] as number;
    },
    runEvaluations: (evaluations) => {
      const slot = world.engine.content.constants.housingEvaluationTickOfDay;
      for (let done = 0; done < evaluations; done += 1) {
        do {
          world.run(1);
        } while (world.engine.time.tickCount % ticksPerDay !== slot);
      }
    },
    residents: (dwellingId) =>
      world.engine.store
        .entities()
        .filter(
          (entity) =>
            (entity.components["Citizen"] as { homeDwellingId: number | null } | undefined)
              ?.homeDwellingId === dwellingId,
        )
        .map((entity) => entity.id),
    tiles: (dwellingId) => {
      const data = getComponent(world.engine.store.require(dwellingId), zoneComponent);
      return data === undefined ? [] : [...data.tiles];
    },
  };
}

/**
 * Parses a JSON value that a query returned as an array of objects (test convenience).
 *
 * @param value - A query result.
 * @returns The value typed as a list of records.
 */
export function asRecords(value: JsonValue): { [field: string]: JsonValue }[] {
  return Array.isArray(value) ? (value as { [field: string]: JsonValue }[]) : [];
}

/**
 * The bundled pack with changed dwelling levels: every record named in `patches` gets the fields of
 * its patch (a shallow merge of raw `dwelling-levels.json` fields), the rest stay as shipped.
 *
 * @param patches - Level id to the fields to replace, for example `{ cottage: { foodVariety: 0 } }`;
 *   a field set to null is removed.
 * @returns Fresh registries.
 */
export function contentWithLevels(patches: {
  [level: string]: { [field: string]: JsonValue };
}): ContentRegistries {
  const shipped = bundledContentFiles[ContentFile.DwellingLevels];
  const levels = (Array.isArray(shipped) ? shipped : []).map((record) => {
    const fields = record as { [field: string]: JsonValue };
    const patch = typeof fields["level"] === "string" ? patches[fields["level"]] : undefined;
    if (patch === undefined) {
      return record;
    }
    const merged = { ...fields, ...patch };
    for (const [name, value] of Object.entries(patch)) {
      if (value === null) {
        delete merged[name];
      }
    }
    return merged;
  });
  return loadContentPack({ ...bundledContentFiles, [ContentFile.DwellingLevels]: levels });
}
