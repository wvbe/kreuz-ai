import type { MapEntityView } from "../../../game/api/Views";
import type { CameraState, Viewport } from "./cameraMath";
import type { CropCell } from "./instanceLayout";
import type { TickMotion } from "./entityMotion";
import type { MapScene } from "./mapScene";

/**
 * What stands on a zone besides its tint (see `StructureLayer`).
 */
export type ZoneStructure = {
  /**
   * Dwelling level id of a dwelling zone, null for any other zone.
   */
  dwellingLevel: string | null;
  /**
   * The dwelling's downgrade streak is running (`housing.dwelling.at-risk`).
   */
  atRisk: boolean;
  /**
   * The zone is a Bell Tower.
   */
  bellTower: boolean;
  /**
   * The bell rang a moment ago.
   */
  ringing: boolean;
};

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
  /**
   * The model that stands on the zone, when it has one.
   */
  structure?: ZoneStructure;
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
  /**
   * The tick clock for sliding entities between cells; absent means no interpolation.
   */
  motion?: TickMotion;
};
