import type { GroundPoint } from "./cameraMath";

/**
 * The real-time clock of the game as the canvas needs it to smooth movement (spec 024 SC-002,
 * spec 004 SC-002). Interpolation is purely cosmetic: the game state always holds whole cells.
 */
export type TickMotion = {
  /**
   * The game tick the entities belong to; a change starts a new interpolation.
   */
  tick: number;
  /**
   * Real milliseconds between two ticks at the current speed.
   */
  tickMs: number;
  /**
   * While paused entities stand on their cells (no interpolation).
   */
  paused: boolean;
};

/**
 * The longest step (in world units) that is interpolated; a longer jump (a teleport, an entity
 * that changed map or an area) snaps to the new place.
 */
export const maxInterpolatedStep = 2.5;

/**
 * Real milliseconds between ticks for an interval at normal speed and a speed in permille
 * (the same rule as the engine clock: `floor(intervalMs * 1000 / speed)`).
 *
 * @param tickIntervalMs - Milliseconds per tick at normal speed.
 * @param speedPermille - The speed multiplier in permille (1000 is normal).
 * @returns Milliseconds between ticks, at least 1.
 */
export function tickDelayMs(tickIntervalMs: number, speedPermille: number): number {
  if (speedPermille <= 0) {
    return Math.max(1, tickIntervalMs);
  }
  return Math.max(1, Math.floor((tickIntervalMs * 1000) / speedPermille));
}

/**
 * How far through the current tick interval the clock is.
 *
 * @param elapsedMs - Real milliseconds since the tick arrived.
 * @param tickMs - Real milliseconds per tick.
 * @param paused - Whether the game is paused.
 * @returns A number from 0 to 1; 1 when paused or when the interval is not positive.
 */
export function tickProgress(elapsedMs: number, tickMs: number, paused: boolean): number {
  if (paused || tickMs <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, elapsedMs / tickMs));
}

/**
 * Where an entity is drawn between its previous and current cell centre.
 *
 * @param previous - The centre it stood on one tick ago, or undefined when it is new.
 * @param current - The centre of its cell now.
 * @param progress - Tick progress from 0 to 1.
 * @param snapDistance - Jumps longer than this snap to `current`.
 * @returns The drawn position.
 */
export function interpolatePosition(
  previous: GroundPoint | undefined,
  current: GroundPoint,
  progress: number,
  snapDistance: number = maxInterpolatedStep,
): GroundPoint {
  if (previous === undefined || progress >= 1) {
    return current;
  }
  const dx = current.x - previous.x;
  const dzz = current.z - previous.z;
  if (Math.hypot(dx, dzz) > snapDistance) {
    return current;
  }
  const ratio = Math.max(0, progress);
  return { x: previous.x + dx * ratio, z: previous.z + dzz * ratio };
}
