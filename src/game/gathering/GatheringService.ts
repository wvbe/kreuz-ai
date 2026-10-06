import { z } from "zod";
import type { JsonValue } from "../engine/EventBus";
import { SaveSectionLocation } from "../save/SaveSectionRegistry";
import type { SaveSection } from "../save/SaveSectionRegistry";
import { CropStage } from "./gatheringTypes";
import type { CropPlot, DepositRecord } from "./gatheringTypes";

const cellSchema = z.number().int().min(0);

const gatheringSectionSchema = z
  .object({
    plots: z.array(
      z
        .object({
          mapId: cellSchema,
          cellIndex: cellSchema,
          materialId: z.string().min(1),
          stage: z.enum([CropStage.Sown, CropStage.Ripe]),
          growthMilli: cellSchema,
        })
        .strict(),
    ),
    deposits: z.array(
      z
        .object({
          mapId: cellSchema,
          cellIndex: cellSchema,
          remaining: z.number().int().min(1),
        })
        .strict(),
    ),
  })
  .strict();

function keyOf(mapId: number, cellIndex: number): string {
  return `${mapId}:${cellIndex}`;
}

function byCell(
  left: { mapId: number; cellIndex: number },
  right: { mapId: number; cellIndex: number },
): number {
  return left.mapId === right.mapId ? left.cellIndex - right.cellIndex : left.mapId - right.mapId;
}

/**
 * Per-engine gathering state that is not on entities: the crop plots of sown and ripe field cells
 * and the charges left of partly worked deposits (saved in the section `systems.gathering`).
 * Fallow cells and untouched deposits have no record.
 */
export class GatheringService {
  private readonly plotMap = new Map<string, CropPlot>();
  private readonly depositMap = new Map<string, DepositRecord>();

  /**
   * The plot of a cell.
   *
   * @param mapId - Map id.
   * @param cellIndex - Cell index.
   * @returns The live plot, or undefined for a fallow cell.
   */
  plotAt(mapId: number, cellIndex: number): CropPlot | undefined {
    return this.plotMap.get(keyOf(mapId, cellIndex));
  }

  /**
   * Stores a plot (replaces the one of the cell).
   *
   * @param plot - The plot.
   */
  setPlot(plot: CropPlot): void {
    this.plotMap.set(keyOf(plot.mapId, plot.cellIndex), plot);
  }

  /**
   * Removes the plot of a cell (back to fallow).
   *
   * @param mapId - Map id.
   * @param cellIndex - Cell index.
   * @returns True when there was a plot.
   */
  clearPlot(mapId: number, cellIndex: number): boolean {
    return this.plotMap.delete(keyOf(mapId, cellIndex));
  }

  /**
   * Every plot, ascending by map then cell.
   *
   * @returns The live plots.
   */
  plots(): CropPlot[] {
    return [...this.plotMap.values()].sort(byCell);
  }

  /**
   * The charges left of a partly worked deposit cell.
   *
   * @param mapId - Map id.
   * @param cellIndex - Cell index.
   * @returns The remaining charges, or undefined when the cell was never worked.
   */
  remainingAt(mapId: number, cellIndex: number): number | undefined {
    return this.depositMap.get(keyOf(mapId, cellIndex))?.remaining;
  }

  /**
   * Records the charges left of a deposit cell.
   *
   * @param mapId - Map id.
   * @param cellIndex - Cell index.
   * @param remaining - Charges left, at least 1.
   */
  setRemaining(mapId: number, cellIndex: number, remaining: number): void {
    this.depositMap.set(keyOf(mapId, cellIndex), { mapId, cellIndex, remaining });
  }

  /**
   * Forgets a deposit cell (it ran out).
   *
   * @param mapId - Map id.
   * @param cellIndex - Cell index.
   */
  clearRemaining(mapId: number, cellIndex: number): void {
    this.depositMap.delete(keyOf(mapId, cellIndex));
  }

  /**
   * The partly worked deposits, ascending by map then cell.
   *
   * @returns Copies of the records.
   */
  deposits(): DepositRecord[] {
    return [...this.depositMap.values()].sort(byCell).map((record) => ({ ...record }));
  }

  /**
   * The save section `systems.gathering`: plots and deposit charges, ascending by cell.
   *
   * @returns The section for `registerSystem({ saveSection })`.
   */
  createSection(): SaveSection {
    return {
      key: "gathering",
      location: SaveSectionLocation.Systems,
      schema: gatheringSectionSchema,
      serialize: (): JsonValue => ({
        plots: this.plots().map((plot) => ({ ...plot })),
        deposits: this.deposits(),
      }),
      restore: (saved: JsonValue) => {
        const parsed = gatheringSectionSchema.parse(saved);
        this.plotMap.clear();
        this.depositMap.clear();
        for (const plot of parsed.plots) {
          this.setPlot(plot);
        }
        for (const record of parsed.deposits) {
          this.setRemaining(record.mapId, record.cellIndex, record.remaining);
        }
      },
      defaultForOlderSaves: () => ({ plots: [], deposits: [] }),
    };
  }
}
