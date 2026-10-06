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
};

const inspectTool: ToolState = { mode: ToolMode.Inspect, prototypeId: null };

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
    this.replace({ mode: ToolMode.Place, prototypeId });
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
