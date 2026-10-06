import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { getGatheringService } from "./gatheringServiceRegistry";
import {
  CropStage,
  cropRipenedEvent,
  farmFieldZoneTypeId,
  fertileTerrainId,
  normalGrowthMilli,
} from "./gatheringTypes";
import type { CropPlot } from "./gatheringTypes";
import { seasonModifier } from "./seasonModifier";

/**
 * A crop field cell the poster and the executors act on: the field zone it is in.
 */
export type FieldCell = {
  zoneId: EntityId;
  mapId: number;
  cellIndex: number;
};

/**
 * The crop of a zone type: the material of the first of its `cropOutputs` (DECISIONS D-15).
 *
 * @param engine - The engine.
 * @param zoneTypeId - Zone type id.
 * @returns The crop material and what one harvested cell yields, or null for a zone type that
 *   grows nothing.
 */
export function cropOfZoneType(
  engine: GameEngine,
  zoneTypeId: string,
): { materialId: string; quantity: number } | null {
  const first = engine.content.zones.find(zoneTypeId)?.cropOutputs[0];
  return first === undefined ? null : { materialId: first.materialId, quantity: first.quantity };
}

/**
 * Growth time of a crop in milli-ticks (`cropGrowthTicks` of the content constants, one value for
 * every crop, DECISIONS D-52).
 *
 * @param engine - The engine.
 * @returns Milli-ticks of growth a plot needs to become ripe.
 */
export function cropGrowthMilli(engine: GameEngine): number {
  return engine.content.constants.cropGrowthTicks * normalGrowthMilli;
}

/**
 * Tells whether a zone is a field whose effects work now: a live `farm_field` zone that is
 * active and past its activation tick (the effects of a zone count from the tick after it became
 * active, DECISIONS D-11).
 *
 * @param engine - The engine.
 * @param zoneId - Zone id.
 * @returns True for a working field.
 */
export function isWorkingField(engine: GameEngine, zoneId: EntityId): boolean {
  const zone = getZoneService(engine).getZone(zoneId);
  return (
    zone !== null &&
    zone.data.zoneTypeId === farmFieldZoneTypeId &&
    zone.data.active &&
    zone.data.activeSinceTick !== null &&
    engine.time.tickCount > zone.data.activeSinceTick
  );
}

/**
 * The cells of a field zone that can hold a crop: its tiles of fertile soil, ascending. A zone
 * painted over other terrain simply has fewer (possibly no) cells.
 *
 * @param engine - The engine.
 * @param zoneId - Zone id.
 * @returns Cell indices, empty for an unknown zone.
 */
export function fertileCellsOf(engine: GameEngine, zoneId: EntityId): number[] {
  const zone = getZoneService(engine).getZone(zoneId);
  const map = zone === null ? undefined : engine.maps.get(zone.data.mapId);
  if (zone === null || map === undefined) {
    return [];
  }
  return zone.data.tiles
    .filter((cell) => map.terrainAt(cell) === fertileTerrainId)
    .sort((left, right) => left - right);
}

/**
 * The field a cell belongs to when crops grow there now: a working `farm_field` zone and fertile
 * soil.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns The field cell, or null when no crop can grow there.
 */
export function fieldCellAt(
  engine: GameEngine,
  mapId: number,
  cellIndex: number,
): FieldCell | null {
  const zoneId = getZoneService(engine).zoneIdAt(mapId, cellIndex);
  const map = engine.maps.get(mapId);
  if (
    zoneId === null ||
    map === undefined ||
    map.terrainAt(cellIndex) !== fertileTerrainId ||
    !isWorkingField(engine, zoneId)
  ) {
    return null;
  }
  return { zoneId, mapId, cellIndex };
}

/**
 * The stage of a cell: `Sown` or `Ripe` from its plot, `Fallow` otherwise.
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns The stage.
 */
export function cropStageAt(engine: GameEngine, mapId: number, cellIndex: number): CropStage {
  return getGatheringService(engine).plotAt(mapId, cellIndex)?.stage ?? CropStage.Fallow;
}

/**
 * Sows a fallow field cell: the plot starts growing (no seed item is consumed, DECISIONS D-15).
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns The new plot, or null when the cell is not a working field cell, is not fallow or its
 *   zone grows no crop.
 */
export function sowCell(engine: GameEngine, mapId: number, cellIndex: number): CropPlot | null {
  const field = fieldCellAt(engine, mapId, cellIndex);
  const zone = field === null ? null : getZoneService(engine).getZone(field.zoneId);
  const crop = zone === null ? null : cropOfZoneType(engine, zone.data.zoneTypeId);
  const service = getGatheringService(engine);
  if (crop === null || service.plotAt(mapId, cellIndex) !== undefined) {
    return null;
  }
  const plot: CropPlot = {
    mapId,
    cellIndex,
    materialId: crop.materialId,
    stage: CropStage.Sown,
    growthMilli: 0,
  };
  service.setPlot(plot);
  return plot;
}

/**
 * Harvests a ripe cell: the plot is removed (the cell is fallow again).
 *
 * @param engine - The engine.
 * @param mapId - Map id.
 * @param cellIndex - Cell index.
 * @returns The removed plot, or null when the cell is not ripe or no longer a working field cell.
 */
export function harvestCell(engine: GameEngine, mapId: number, cellIndex: number): CropPlot | null {
  const service = getGatheringService(engine);
  const plot = service.plotAt(mapId, cellIndex);
  if (
    plot === undefined ||
    plot.stage !== CropStage.Ripe ||
    fieldCellAt(engine, mapId, cellIndex) === null
  ) {
    return null;
  }
  service.clearPlot(mapId, cellIndex);
  return plot;
}

/**
 * The per-tick crop pass (slot 12): drops plots whose cell is no longer fertile soil of a
 * `farm_field` zone (zone deleted, tile removed, terrain changed), then adds one tick of growth,
 * scaled by {@link seasonModifier}, to every sown plot in a working field; a plot that reaches
 * the growth time becomes ripe and `gathering.crop.ripened` is emitted. Plots are visited
 * ascending by map and cell.
 *
 * @param engine - The engine.
 */
export function growCrops(engine: GameEngine): void {
  const service = getGatheringService(engine);
  const needed = cropGrowthMilli(engine);
  for (const plot of service.plots()) {
    const zoneId = getZoneService(engine).zoneIdAt(plot.mapId, plot.cellIndex);
    const zone = zoneId === null ? null : getZoneService(engine).getZone(zoneId);
    const map = engine.maps.get(plot.mapId);
    if (
      zone === null ||
      zone.data.zoneTypeId !== farmFieldZoneTypeId ||
      map === undefined ||
      map.terrainAt(plot.cellIndex) !== fertileTerrainId
    ) {
      service.clearPlot(plot.mapId, plot.cellIndex);
      continue;
    }
    if (plot.stage !== CropStage.Sown || zoneId === null || !isWorkingField(engine, zoneId)) {
      continue;
    }
    plot.growthMilli += Math.floor((normalGrowthMilli * seasonModifier()) / 1000);
    if (plot.growthMilli >= needed) {
      plot.growthMilli = needed;
      plot.stage = CropStage.Ripe;
      engine.bus.emit(cropRipenedEvent, {
        mapId: plot.mapId,
        cellIndex: plot.cellIndex,
        materialId: plot.materialId,
      });
    }
  }
}
