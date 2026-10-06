import type { MapEntityView } from "../../../game/api/Views";
import type { CameraState, Viewport } from "./cameraMath";
import type { CropCell } from "./instanceLayout";
import type { MapScene } from "./mapScene";

/**
 * A zone to tint on the map.
 */
export type ZoneOverlay = {
  zoneId: number;
  zoneTypeId: string;
  cells: readonly number[];
  /**
   * Whether the zone is active; inactive zones are drawn fainter.
   */
  active: boolean;
};

/**
 * The placement ghost: the cell under the pointer while a build definition is being placed.
 */
export type PlacementGhost = {
  prototypeId: string;
  cell: number;
  /**
   * Whether `validate-placement` accepts the cell (green) or not (red).
   */
  valid: boolean;
};

/**
 * Everything the WebGL canvas draws. The canvas is a pure function of these props: it owns no
 * state, reads no query and handles no pointer; `MapViewport` does all of that in the DOM.
 */
export type MapCanvasProps = {
  scene: MapScene;
  camera: CameraState;
  viewport: Viewport;
  entities: readonly MapEntityView[];
  crops: readonly CropCell[];
  zones: readonly ZoneOverlay[];
  showZones: boolean;
  hoverCell: number | null;
  selectedCell: number | null;
  selectedEntityId: number | null;
  ghost: PlacementGhost | null;
};
