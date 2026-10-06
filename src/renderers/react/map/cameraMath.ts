/**
 * Pure math of the isometric orthographic camera (spec 024 FR-001). World units are tiles on
 * the ground plane (`x`, `z`) with `y` up; the renderer may use floats, the game never sees them.
 */

/**
 * The camera: where it looks, how far it is zoomed in and how it is turned about the vertical.
 */
export type CameraState = {
  /**
   * Ground point at the centre of the screen, world x.
   */
  centerX: number;
  /**
   * Ground point at the centre of the screen, world z.
   */
  centerZ: number;
  /**
   * Pixels per world unit along the screen's horizontal axis.
   */
  zoom: number;
  /**
   * Turn about the vertical axis in radians (0 looks along -z).
   */
  rotation: number;
};

/**
 * The size of the drawing area in pixels.
 */
export type Viewport = {
  width: number;
  height: number;
};

/**
 * A point on the ground plane.
 */
export type GroundPoint = {
  x: number;
  z: number;
};

/**
 * A point on the screen in pixels from the top left.
 */
export type ScreenPoint = {
  x: number;
  y: number;
};

/**
 * Elevation of the classic isometric view, `atan(1 / sqrt(2))` (about 35.26 degrees).
 */
export const isoPitch = Math.atan(1 / Math.SQRT2);

/**
 * Closest allowed zoom in pixels per world unit.
 */
export const minZoom = 6;

/**
 * Farthest-in allowed zoom in pixels per world unit.
 */
export const maxZoom = 160;

const sinPitch = Math.sin(isoPitch);
const cosPitch = Math.cos(isoPitch);

/**
 * A camera looking at the middle of a world of the given size, turned a quarter-eighth so the
 * map reads as a diamond.
 *
 * @param worldSize - Width and depth of the map in world units.
 * @param viewport - Drawing area; the zoom fits the map into it.
 * @returns The starting camera.
 */
export function defaultCamera(worldSize: GroundPoint, viewport: Viewport): CameraState {
  const reach = Math.max(worldSize.x, worldSize.z) * Math.SQRT2;
  const fit = Math.min(viewport.width, viewport.height) / Math.max(reach, 1);
  return {
    centerX: worldSize.x / 2,
    centerZ: worldSize.z / 2,
    zoom: clampZoom(fit),
    rotation: Math.PI / 4,
  };
}

/**
 * Limits a zoom to the allowed range.
 *
 * @param zoom - Wanted zoom.
 * @returns The zoom within `minZoom..maxZoom`.
 */
export function clampZoom(zoom: number): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

/**
 * Where a world point appears on screen.
 *
 * @param camera - The camera.
 * @param viewport - The drawing area.
 * @param point - Ground point.
 * @param height - Height above the ground in world units (default 0).
 * @returns The pixel position.
 */
export function worldToScreen(
  camera: CameraState,
  viewport: Viewport,
  point: GroundPoint,
  height = 0,
): ScreenPoint {
  const dx = point.x - camera.centerX;
  const deltaZ = point.z - camera.centerZ;
  const sin = Math.sin(camera.rotation);
  const cos = Math.cos(camera.rotation);
  return {
    x: viewport.width / 2 + camera.zoom * (dx * cos - deltaZ * sin),
    y:
      viewport.height / 2 +
      camera.zoom * (sinPitch * (dx * sin + deltaZ * cos) - cosPitch * height),
  };
}

/**
 * The ground point under a screen pixel: the ray through an orthographic camera hits the ground
 * plane (`y = 0`) at exactly this point, so no WebGL is needed to pick.
 *
 * @param camera - The camera.
 * @param viewport - The drawing area.
 * @param screen - Pixel position.
 * @returns The ground point.
 */
export function screenToGround(
  camera: CameraState,
  viewport: Viewport,
  screen: ScreenPoint,
): GroundPoint {
  const across = (screen.x - viewport.width / 2) / camera.zoom;
  const down = (screen.y - viewport.height / 2) / (camera.zoom * sinPitch);
  const sin = Math.sin(camera.rotation);
  const cos = Math.cos(camera.rotation);
  return {
    x: camera.centerX + across * cos + down * sin,
    z: camera.centerZ - across * sin + down * cos,
  };
}

/**
 * Pans so the world follows the pointer: dragging by a pixel delta moves the picture with it.
 *
 * @param camera - The camera.
 * @param deltaX - Pointer movement in pixels, horizontal.
 * @param deltaY - Pointer movement in pixels, vertical.
 * @returns The moved camera.
 */
export function panByScreen(camera: CameraState, deltaX: number, deltaY: number): CameraState {
  const across = deltaX / camera.zoom;
  const down = deltaY / (camera.zoom * sinPitch);
  const sin = Math.sin(camera.rotation);
  const cos = Math.cos(camera.rotation);
  return {
    ...camera,
    centerX: camera.centerX - (across * cos + down * sin),
    centerZ: camera.centerZ - (-across * sin + down * cos),
  };
}

/**
 * Zooms by a factor keeping the ground point under the pointer where it is.
 *
 * @param camera - The camera.
 * @param viewport - The drawing area.
 * @param factor - Multiplier (above 1 zooms in).
 * @param anchor - Pixel to keep still.
 * @returns The zoomed camera.
 */
export function zoomAt(
  camera: CameraState,
  viewport: Viewport,
  factor: number,
  anchor: ScreenPoint,
): CameraState {
  const zoom = clampZoom(camera.zoom * factor);
  const before = screenToGround(camera, viewport, anchor);
  const zoomed = { ...camera, zoom };
  const after = screenToGround(zoomed, viewport, anchor);
  return {
    ...zoomed,
    centerX: camera.centerX + (before.x - after.x),
    centerZ: camera.centerZ + (before.z - after.z),
  };
}

/**
 * Turns the camera about the vertical axis.
 *
 * @param camera - The camera.
 * @param delta - Radians to add.
 * @returns The turned camera.
 */
export function rotateBy(camera: CameraState, delta: number): CameraState {
  return { ...camera, rotation: camera.rotation + delta };
}

/**
 * Keeps the centre of the view inside the map.
 *
 * @param camera - The camera.
 * @param worldSize - Width and depth of the map in world units.
 * @returns The camera with its centre clamped.
 */
export function clampToWorld(camera: CameraState, worldSize: GroundPoint): CameraState {
  return {
    ...camera,
    centerX: Math.min(worldSize.x, Math.max(0, camera.centerX)),
    centerZ: Math.min(worldSize.z, Math.max(0, camera.centerZ)),
  };
}

/**
 * Where a three.js orthographic camera has to sit to show this view.
 *
 * @param camera - The camera.
 * @param distance - Distance from the target along the view axis (any value beyond the map
 * works for an orthographic camera).
 * @returns Position and target in world coordinates.
 */
export function cameraPose(
  camera: CameraState,
  distance = 200,
): { position: [number, number, number]; target: [number, number, number] } {
  const horizontal = distance * cosPitch;
  return {
    position: [
      camera.centerX + horizontal * Math.sin(camera.rotation),
      distance * sinPitch,
      camera.centerZ + horizontal * Math.cos(camera.rotation),
    ],
    target: [camera.centerX, 0, camera.centerZ],
  };
}

/**
 * The ground area currently visible, as an axis-aligned box (for culling).
 *
 * @param camera - The camera.
 * @param viewport - The drawing area.
 * @returns Minimum and maximum x and z of the four screen corners on the ground.
 */
export function visibleGroundBounds(
  camera: CameraState,
  viewport: Viewport,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const corners = [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: 0, y: viewport.height },
    { x: viewport.width, y: viewport.height },
  ].map((corner) => screenToGround(camera, viewport, corner));
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minZ: Math.min(...corners.map((corner) => corner.z)),
    maxZ: Math.max(...corners.map((corner) => corner.z)),
  };
}
