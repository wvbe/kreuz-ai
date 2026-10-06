import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { zoneComponent } from "../zones/zoneComponent";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { cropGrowthMilli, cropOfZoneType, fertileCellsOf } from "./cropPlots";
import { getGatheringService } from "./gatheringServiceRegistry";
import { CropStage, farmFieldZoneTypeId } from "./gatheringTypes";
import type { CropView } from "./gatheringTypes";

/**
 * The cells of the field zones with their crop state (query `crops {zoneId?}`): every fertile
 * cell of every `farm_field` zone (or of one zone), ascending by zone id then cell; a cell without
 * a plot is `Fallow`. Cells of a field painted over other terrain are not listed (nothing grows
 * there).
 *
 * @param engine - The engine.
 * @param zoneId - Only this zone, or undefined for all fields.
 * @returns One entry per cell.
 */
export function buildCropsView(engine: GameEngine, zoneId?: EntityId): CropView[] {
  const service = getGatheringService(engine);
  const needed = cropGrowthMilli(engine);
  const views: CropView[] = [];
  for (const zone of getZoneService(engine).zones()) {
    const data = getComponent(zone, zoneComponent);
    if (
      data === undefined ||
      data.zoneTypeId !== farmFieldZoneTypeId ||
      (zoneId !== undefined && zone.id !== zoneId)
    ) {
      continue;
    }
    const crop = cropOfZoneType(engine, data.zoneTypeId);
    for (const cellIndex of fertileCellsOf(engine, zone.id)) {
      const plot = service.plotAt(data.mapId, cellIndex);
      const growth = plot?.growthMilli ?? 0;
      views.push({
        zoneId: zone.id,
        mapId: data.mapId,
        cellIndex,
        materialId: plot?.materialId ?? crop?.materialId ?? "",
        stage: plot?.stage ?? CropStage.Fallow,
        growthPermille: Math.floor((growth * 1000) / needed),
        ticksToRipe: plot?.stage === CropStage.Sown ? Math.ceil((needed - growth) / 1000) : null,
      });
    }
  }
  return views.sort((left, right) =>
    left.zoneId === right.zoneId ? left.cellIndex - right.cellIndex : left.zoneId - right.zoneId,
  );
}
