import { StoreBase } from "../engine/StoreBase";

/**
 * What a click on the map does.
 */
export enum ToolMode {
  /**
   * Select and inspect (the default).
   */
  Inspect = "inspect",
  /**
   * Place a build definition (furniture, wall or door) with a ghost under the pointer.
   */
  Place = "place",
  /**
   * Paint cells by dragging: designate a zone, or add or remove tiles of a selected zone.
   */
  Paint = "paint",
  /**
   * Drag a rectangle of cells to queue walls on it (the wall tool of the build menu).
   */
  Walls = "walls",
}

/**
 * What a paint stroke does when the button is released.
 */
export enum PaintAction {
  Designate = "designate",
  AddTiles = "add-tiles",
  RemoveTiles = "remove-tiles",
}

/**
 * The active map tool. Later tasks add modes (zone painting, wall dragging) and their fields.
 */
export type ToolState = {
  mode: ToolMode;
  /**
   * The build definition being placed in `Place` mode.
   */
  prototypeId: string | null;
  /**
   * What a stroke does in `Paint` mode, else null.
   */
  paintAction: PaintAction | null;
  /**
   * The zone type designated by a stroke (`Designate` only).
   */
  zoneTypeId: string | null;
  /**
   * The zone whose tiles a stroke changes (`AddTiles` and `RemoveTiles` only).
   */
  zoneId: number | null;
};

const inspectTool: ToolState = {
  mode: ToolMode.Inspect,
  prototypeId: null,
  paintAction: null,
  zoneTypeId: null,
  zoneId: null,
};

/**
 * The map tool store: the build menu enters placement here, the map canvas shows the ghost and
 * confirms or cancels.
 */
export class ToolStore extends StoreBase<ToolState> {
  /**
   * Creates the store in inspect mode.
   */
  constructor() {
    super(inspectTool);
  }

  /**
   * Starts placing a build definition.
   *
   * @param prototypeId - Furniture, wall or door id of the build menu.
   */
  enterPlacement(prototypeId: string): void {
    this.replace({ ...inspectTool, mode: ToolMode.Place, prototypeId });
  }

  /**
   * Starts painting cells.
   *
   * @param paintAction - What the stroke does.
   * @param target - The zone type (designate) or the zone id (add or remove tiles).
   */
  enterPaint(paintAction: PaintAction, target: { zoneTypeId?: string; zoneId?: number }): void {
    this.replace({
      ...inspectTool,
      mode: ToolMode.Paint,
      paintAction,
      zoneTypeId: target.zoneTypeId ?? null,
      zoneId: target.zoneId ?? null,
    });
  }

  /**
   * Starts the wall tool: drag a rectangle to queue walls on its cells.
   */
  enterWalls(): void {
    this.replace({ ...inspectTool, mode: ToolMode.Walls, prototypeId: "wall" });
  }

  /**
   * Returns to inspect mode.
   */
  cancel(): void {
    if (this.getSnapshot().mode !== ToolMode.Inspect) {
      this.replace(inspectTool);
    }
  }
}
