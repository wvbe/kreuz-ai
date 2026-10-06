import type { CommandResult } from "../../../game/api/CommandResult";
import type { GameCommands } from "../engine/gameCommands";
import { PaintAction, ToolMode } from "../selection/ToolStore";
import type { ToolState } from "../selection/ToolStore";

/**
 * The command a finished drag stroke sends for the active tool: `DesignateZone`, `AddZoneTiles`,
 * `RemoveZoneTiles` for painting, `QueueWalls` for the wall rectangle. Nothing is sent for an
 * empty stroke or a tool that does not stroke.
 *
 * @param commands - The host's command surface.
 * @param tool - The active tool.
 * @param mapId - The map the cells are on.
 * @param cells - The cells the stroke collected.
 * @param canBuild - For the wall tool: whether a wall may stand on a cell. Refused cells are left
 *   out, because `QueueWalls` takes all its cells or none; the default accepts every cell.
 * @returns The command result, or null when nothing was sent.
 */
export function commitStroke(
  commands: GameCommands,
  tool: ToolState,
  mapId: number,
  cells: readonly number[],
  canBuild: (cell: number) => boolean = () => true,
): CommandResult | null {
  if (cells.length === 0) {
    return null;
  }
  if (tool.mode === ToolMode.Walls) {
    const buildable = cells.filter(canBuild);
    return buildable.length === 0
      ? null
      : commands.send({
          kind: "QueueWalls",
          prototypeId: tool.prototypeId ?? "wall",
          mapId,
          cells: buildable,
        });
  }
  if (tool.mode !== ToolMode.Paint) {
    return null;
  }
  if (tool.paintAction === PaintAction.Designate && tool.zoneTypeId !== null) {
    return commands.send({
      kind: "DesignateZone",
      zoneTypeId: tool.zoneTypeId,
      mapId,
      cells: [...cells],
    });
  }
  if (tool.zoneId !== null && tool.paintAction === PaintAction.AddTiles) {
    return commands.send({ kind: "AddZoneTiles", zoneId: tool.zoneId, cells: [...cells] });
  }
  if (tool.zoneId !== null && tool.paintAction === PaintAction.RemoveTiles) {
    return commands.send({ kind: "RemoveZoneTiles", zoneId: tool.zoneId, cells: [...cells] });
  }
  return null;
}
