import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { getGatheringService } from "./gatheringServiceRegistry";
import {
  CropStage,
  cropRipenedEvent,
  fertileTerrainId,
  harvestJobId,
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
 * Growth time of a crop in milli-ticks: the `cropGrowthTicks` of its zone type, or the content
 * constant `cropGrowthTicks` when the zone type names none (DECISIONS D-52, D-130).
 *
 * @param engine - The engine.
 * @param zoneTypeId - Zone type id of the crop zone (default: the constant for every crop).
 * @returns Milli-ticks of growth a plot needs to become ripe.
 */
export function cropGrowthMilli(engine: GameEngine, zoneTypeId?: string): number {
  const own = zoneTypeId === undefined ? undefined : engine.content.zones.find(zoneTypeId);
  return (own?.cropGrowthTicks ?? engine.content.constants.cropGrowthTicks) * normalGrowthMilli;
}

/**
 * The terrain the plots of a crop zone type need: its `cropTerrainId`, `fertile_soil` by default.
 *
 * @param engine - The engine.
 * @param zoneTypeId - Zone type id.
 * @returns The terrain id.
 */
export function cropTerrainOf(engine: GameEngine, zoneTypeId: string): string {
  return engine.content.zones.find(zoneTypeId)?.cropTerrainId ?? fertileTerrainId;
}

/**
 * The job that harvests ripe cells of a crop zone type: its `harvestJobId`, `farm.harvest` by
 * default.
 *
 * @param engine - The engine.
 * @param zoneTypeId - Zone type id.
 * @returns The job type id.
 */
export function harvestJobOf(engine: GameEngine, zoneTypeId: string): string {
  return engine.content.zones.find(zoneTypeId)?.harvestJobId ?? harvestJobId;
}

/**
 * Tells whether a zone type grows crops (it lists `cropOutputs`).
 *
 * @param engine - The engine.
 * @param zoneTypeId - Zone type id.
 * @returns True for a crop zone type (farm field, flax field, orchard, ...).
 */
export function isCropZoneType(engine: GameEngine, zoneTypeId: string): boolean {
  return cropOfZoneType(engine, zoneTypeId) !== null;
}

/**
 * Tells whether a zone is a field whose effects work now: a live crop zone (farm field, flax
 * field, orchard, ...) that is active and past its activation tick (the effects of a zone count
 * from the tick after it became active, DECISIONS D-11).
 *
 * @param engine - The engine.
 * @param zoneId - Zone id.
 * @returns True for a working field.
 */
export function isWorkingField(engine: GameEngine, zoneId: EntityId): boolean {
  const zone = getZoneService(engine).getZone(zoneId);
  return (
    zone !== null &&
    isCropZoneType(engine, zone.data.zoneTypeId) &&
    zone.data.active &&
    zone.data.activeSinceTick !== null &&
    engine.time.tickCount > zone.data.activeSinceTick
  );
}

/**
 * The cells of a crop zone that can hold a crop: its tiles of the crop terrain (fertile soil
 * unless the zone type says otherwise), ascending. A zone painted over other terrain simply has
 * fewer (possibly no) cells.
 *
 * @param engine - The engine.
 * @param zoneId - Zone id.
 * @returns Cell indices, empty for an unknown zone.
 */
export function cropCellsOf(engine: GameEngine, zoneId: EntityId): number[] {
  const zone = getZoneService(engine).getZone(zoneId);
  const map = zone === null ? undefined : engine.maps.get(zone.data.mapId);
  if (zone === null || map === undefined) {
    return [];
  }
  const terrainId = cropTerrainOf(engine, zone.data.zoneTypeId);
  return zone.data.tiles
    .filter((cell) => map.terrainAt(cell) === terrainId)
    .sort((left, right) => left - right);
}

/**
 * The field a cell belongs to when crops grow there now: a working crop zone and the terrain its
 * crop needs.
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
  const zone = zoneId === null ? null : getZoneService(engine).getZone(zoneId);
  if (
    zoneId === null ||
    zone === null ||
    map === undefined ||
    map.terrainAt(cellIndex) !== cropTerrainOf(engine, zone.data.zoneTypeId) ||
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
 * The per-tick crop pass (slot 12): drops plots whose cell is no longer crop terrain of a crop
 * zone (zone deleted, tile removed, terrain changed), plants every free cell of a working
 * perennial zone (orchard, vineyard, herb garden replant themselves), then adds one tick of
 * growth, scaled by {@link seasonModifier}, to every sown plot in a working field; a plot that
 * reaches its zone type's growth time becomes ripe and `gathering.crop.ripened` is emitted. Plots
 * are visited ascending by map and cell.
 *
 * @param engine - The engine.
 */
export function growCrops(engine: GameEngine): void {
  const service = getGatheringService(engine);
  plantPerennials(engine);
  for (const plot of service.plots()) {
    const zoneId = getZoneService(engine).zoneIdAt(plot.mapId, plot.cellIndex);
    const zone = zoneId === null ? null : getZoneService(engine).getZone(zoneId);
    const map = engine.maps.get(plot.mapId);
    if (
      zone === null ||
      !isCropZoneType(engine, zone.data.zoneTypeId) ||
      map === undefined ||
      map.terrainAt(plot.cellIndex) !== cropTerrainOf(engine, zone.data.zoneTypeId)
    ) {
      service.clearPlot(plot.mapId, plot.cellIndex);
      continue;
    }
    const needed = cropGrowthMilli(engine, zone.data.zoneTypeId);
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

/**
 * Plants every free cell of every working perennial crop zone (`perennial: true`), so orchards,
 * vineyards and herb gardens need no sowing job (DECISIONS D-130). Zones are visited in id order.
 *
 * @param engine - The engine.
 */
export function plantPerennials(engine: GameEngine): void {
  const service = getGatheringService(engine);
  for (const zone of getZoneService(engine).zones()) {
    const data = getZoneService(engine).getZone(zone.id)?.data;
    const type = data === undefined ? undefined : engine.content.zones.find(data.zoneTypeId);
    const crop = type?.cropOutputs[0];
    if (data === undefined || type === undefined || !type.perennial || crop === undefined) {
      continue;
    }
    if (!isWorkingField(engine, zone.id)) {
      continue;
    }
    for (const cellIndex of cropCellsOf(engine, zone.id)) {
      if (service.plotAt(data.mapId, cellIndex) === undefined) {
        service.setPlot({
          mapId: data.mapId,
          cellIndex,
          materialId: crop.materialId,
          stage: CropStage.Sown,
          growthMilli: 0,
        });
      }
    }
  }
}
