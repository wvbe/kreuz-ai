import { BoxGeometry, ConeGeometry, Matrix4, SphereGeometry, TorusGeometry } from "three";
import type { BufferGeometry } from "three";
// eslint-disable-next-line no-restricted-syntax -- the three.js package exports this module only with its .js extension
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function box(width: number, height: number, depth: number, x: number, y: number, z: number) {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  return geometry;
}

// A four-sided cone is a pyramid; turned by 45 degrees its base lines up with the box walls.
function roof(radius: number, height: number, x: number, y: number, z: number) {
  const geometry = new ConeGeometry(radius, height, 4);
  geometry.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 4));
  geometry.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  return geometry;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  if (merged === null) {
    throw new Error("could not merge a structure geometry");
  }
  return merged;
}

/**
 * The dwelling levels that have their own model, from the humblest up (spec 029 FR-002 ids, as the
 * `dwellings` query reports them), and the colour of each: thatch and daub, whitewash, timber,
 * stone and tile.
 */
export const dwellingModels: readonly { level: string; color: number }[] = [
  { level: "hovel", color: 0xb39866 },
  { level: "cottage", color: 0xf1ead8 },
  { level: "timber_framed_house", color: 0xb5835a },
  { level: "burgher_house", color: 0xa8a49c },
];

/**
 * Builds the low-poly model of a dwelling level (spec 024 FR-042): a Hovel is a small daub hut
 * under a thatched roof, a Cottage is taller with a chimney, a Timber-Framed House shows corner
 * posts and beams under a steeper roof, a Burgher House has a stone ground floor, a timber upper
 * storey and a tall tiled roof. Its origin is the centre of its cell on the ground.
 *
 * @param level - The dwelling level id; an unknown id gets the Hovel.
 * @returns The merged geometry (the caller disposes it).
 */
export function createDwellingGeometry(level: string): BufferGeometry {
  switch (level) {
    case "cottage":
      return merge([
        box(0.64, 0.4, 0.5, 0, 0.2, 0),
        roof(0.6, 0.34, 0, 0.57, 0),
        box(0.1, 0.3, 0.1, 0.2, 0.62, 0.12),
      ]);
    case "timber_framed_house":
      return merge([
        box(0.7, 0.5, 0.56, 0, 0.25, 0),
        box(0.06, 0.52, 0.06, -0.36, 0.26, -0.29),
        box(0.06, 0.52, 0.06, 0.36, 0.26, -0.29),
        box(0.06, 0.52, 0.06, -0.36, 0.26, 0.29),
        box(0.06, 0.52, 0.06, 0.36, 0.26, 0.29),
        box(0.76, 0.06, 0.6, 0, 0.5, 0),
        roof(0.66, 0.46, 0, 0.75, 0),
      ]);
    case "burgher_house":
      return merge([
        box(0.8, 0.36, 0.64, 0, 0.18, 0),
        box(0.72, 0.36, 0.58, 0, 0.54, 0),
        box(0.76, 0.05, 0.62, 0, 0.72, 0),
        roof(0.72, 0.5, 0, 0.99, 0),
        box(0.1, 0.34, 0.1, 0.26, 1.0, 0.1),
      ]);
    default:
      return merge([box(0.5, 0.28, 0.44, 0, 0.14, 0), roof(0.52, 0.26, 0, 0.41, 0)]);
  }
}

/**
 * Builds the model of a Bell Tower zone (spec 024 FR-033): a stone tower with a belfry, a cap and
 * the bell. Its origin is the centre of its cell on the ground.
 *
 * @returns The merged geometry (the caller disposes it).
 */
export function createBellTowerGeometry(): BufferGeometry {
  const bell = new SphereGeometry(0.12, 8, 6);
  bell.applyMatrix4(new Matrix4().makeTranslation(0, 1.12, 0));
  return merge([
    box(0.42, 1.0, 0.42, 0, 0.5, 0),
    box(0.54, 0.3, 0.54, 0, 1.15, 0),
    bell,
    roof(0.44, 0.4, 0, 1.5, 0),
  ]);
}

/**
 * Builds the bell-ring indicator (spec 024 FR-033): a flat ring that appears around the tower for
 * a moment when `bell-tower.rang` arrives.
 *
 * @returns The geometry (the caller disposes it).
 */
export function createBellRingGeometry(): BufferGeometry {
  const ring = new TorusGeometry(0.55, 0.05, 6, 24);
  ring.applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2));
  ring.applyMatrix4(new Matrix4().makeTranslation(0, 1.12, 0));
  return ring;
}

/**
 * Builds the at-risk flag (spec 024 FR-044): a pole with a pennant that stands above a dwelling
 * whose downgrade streak is running.
 *
 * @returns The merged geometry (the caller disposes it).
 */
export function createRiskFlagGeometry(): BufferGeometry {
  const pennant = new ConeGeometry(0.14, 0.34, 3);
  pennant.applyMatrix4(new Matrix4().makeRotationZ(-Math.PI / 2));
  pennant.applyMatrix4(new Matrix4().makeTranslation(0.17, 1.55, 0));
  return merge([box(0.04, 0.7, 0.04, 0, 1.3, 0), pennant]);
}
