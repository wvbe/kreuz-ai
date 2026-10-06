import { z } from "zod";
import type { JsonValue } from "../../game/engine/EventBus";

const cropSchema = z.object({
  zoneId: z.number(),
  mapId: z.number(),
  cellIndex: z.number(),
  materialId: z.string(),
  stage: z.string(),
  growthPermille: z.number(),
  ticksToRipe: z.number().nullable(),
});

/**
 * Formats the `crops` query for the `fields` verb: one block per field zone with a line per
 * fertile cell (stage, growth in percent and the ticks until it is ripe) and a summary line.
 *
 * @param view - Data of the `crops` query.
 * @returns Output lines; a note when there are no crop cells, empty when the view is foreign.
 */
export function formatCrops(view: JsonValue): string[] {
  const parsed = z.array(cropSchema).safeParse(view);
  if (!parsed.success) {
    return [];
  }
  if (parsed.data.length === 0) {
    return ["no crop cells (designate a farm_field zone over fertile soil)"];
  }
  const lines: string[] = [];
  const zoneIds = [...new Set(parsed.data.map((crop) => crop.zoneId))];
  for (const zoneId of zoneIds) {
    const cells = parsed.data.filter((crop) => crop.zoneId === zoneId);
    const count = (stage: string): number => cells.filter((crop) => crop.stage === stage).length;
    lines.push(
      `field #${zoneId}: ${cells.length} cells, ${count("Fallow")} fallow, ${count("Sown")} sown, ${count("Ripe")} ripe`,
    );
    for (const crop of cells) {
      const growth =
        crop.stage === "Fallow"
          ? ""
          : `, ${Math.floor(crop.growthPermille / 10)}%${crop.ticksToRipe === null ? "" : `, ripe in ${crop.ticksToRipe} ticks`}`;
      lines.push(`  ${crop.mapId}:${crop.cellIndex} ${crop.materialId} ${crop.stage}${growth}`);
    }
  }
  return lines;
}
