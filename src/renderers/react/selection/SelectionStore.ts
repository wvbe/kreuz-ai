import { StoreBase } from "../engine/StoreBase";

/**
 * A request to move the camera to a cell (the Idle and Blocked list, entity links and the
 * chronicle ask for it).
 */
export type FocusRequest = {
  mapId: number;
  cell: number;
  /**
   * Grows with every request so asking for the same cell twice still moves the camera.
   */
  nonce: number;
};

/**
 * What the player has selected and hovers, and which map is shown.
 */
export type SelectionState = {
  /**
   * The map on screen; null until the map screen picked the first one.
   */
  activeMapId: number | null;
  /**
   * The selected entity (spec 024 FR-005), or null.
   */
  entityId: number | null;
  /**
   * The selected cell on the active map, or null.
   */
  cell: number | null;
  hoverCell: number | null;
  hoverEntityId: number | null;
  focus: FocusRequest | null;
};

const emptySelection: SelectionState = {
  activeMapId: null,
  entityId: null,
  cell: null,
  hoverCell: null,
  hoverEntityId: null,
  focus: null,
};

/**
 * The selection store: the one place the map writes what was clicked and panels read it from
 * (panels of tasks 6.3 to 6.5 subscribe with `useSelection`). It holds ids only; everything else
 * about the selection is read through queries.
 */
export class SelectionStore extends StoreBase<SelectionState> {
  /**
   * Creates a store with nothing selected.
   */
  constructor() {
    super(emptySelection);
  }

  /**
   * Shows another map (sub-map breadcrumb); the selection of the old map is dropped.
   *
   * @param mapId - The map to show.
   */
  setActiveMap(mapId: number): void {
    if (mapId !== this.getSnapshot().activeMapId) {
      this.replace({ ...emptySelection, activeMapId: mapId });
    }
  }

  /**
   * Selects an entity, optionally with the cell it stands on.
   *
   * @param entityId - The entity id, or null to clear the entity selection.
   * @param cell - Its cell, or null.
   */
  selectEntity(entityId: number | null, cell: number | null = null): void {
    this.replace({ ...this.getSnapshot(), entityId, cell });
  }

  /**
   * Selects a cell and no entity.
   *
   * @param cell - The cell index, or null.
   */
  selectCell(cell: number | null): void {
    this.replace({ ...this.getSnapshot(), entityId: null, cell });
  }

  /**
   * Clears the selection (the map and the camera request stay).
   */
  clear(): void {
    this.replace({ ...this.getSnapshot(), entityId: null, cell: null });
  }

  /**
   * Records what the pointer is over.
   *
   * @param hoverCell - The cell under the pointer, or null.
   * @param hoverEntityId - The entity under the pointer, or null.
   */
  setHover(hoverCell: number | null, hoverEntityId: number | null): void {
    const current = this.getSnapshot();
    if (current.hoverCell !== hoverCell || current.hoverEntityId !== hoverEntityId) {
      this.replace({ ...current, hoverCell, hoverEntityId });
    }
  }

  /**
   * Asks the map to centre on a cell and switches to its map.
   *
   * @param mapId - The map the cell is on.
   * @param cell - The cell.
   */
  requestFocus(mapId: number, cell: number): void {
    const current = this.getSnapshot();
    const nonce = (current.focus?.nonce ?? 0) + 1;
    this.replace({
      ...current,
      activeMapId: mapId,
      focus: { mapId, cell, nonce },
    });
  }

  /**
   * Forgets everything (a new or loaded game).
   */
  reset(): void {
    this.replace(emptySelection);
  }
}
