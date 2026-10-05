import type { PrngStream } from "../engine/Prng";
import type { CellPoint, MapGeometry } from "../map/mapTypes";
import { distanceSquared } from "./distanceSquared";
import { cellSpacing } from "./generateOutdoorTerrain";
import { WorldTerrain } from "./WorldTerrain";

const nearSpacings = 5;
const farSpacings = 14;
const maxExtraCells = 2;
const extraChancePermille = 500;
const excluded: readonly string[] = [
  WorldTerrain.WaterShallow,
  WorldTerrain.Mountain,
  WorldTerrain.RockWall,
  WorldTerrain.RoadDirt,
];

/**
 * Places the iron ore source that the Hamlet depends on (DECISIONS D-16, plan item 9): a deposit
 * of one to three cells at the foot of the mountains, five to fourteen cell spacings from the
 * village so it is a real trip but within reach. Falls back to any mountain foot outside the
 * clearing when that band is empty. The caller checks reachability.
 *
 * @param geometry - Geometry of the voronoi map.
 * @param stream - The `world.gen` stream.
 * @param terrain - Terrain list to modify in place.
 * @param villageCenter - Settlement cell.
 * @param clearing - Cells that must stay untouched (the village clearing).
 * @returns The ore cells, ascending; empty when the map has no mountain foot at all.
 */
export function placeIronOre(
  geometry: MapGeometry,
  stream: PrngStream,
  terrain: string[],
  villageCenter: number,
  clearing: readonly number[],
): number[] {
  const spacing = cellSpacing(geometry.cellCount);
  const origin = geometry.centroids[villageCenter] as CellPoint;
  const blocked = new Set(clearing);
  const isFoot = (cell: number): boolean =>
    !blocked.has(cell) &&
    !excluded.includes(terrain[cell] as string) &&
    (geometry.adjacency[cell] as readonly number[]).some(
      (next) => terrain[next] === WorldTerrain.Mountain,
    );
  const feet: number[] = [];
  for (let cell = 0; cell < terrain.length; cell += 1) {
    if (isFoot(cell)) {
      feet.push(cell);
    }
  }
  const band = feet.filter((cell) => {
    const distance = distanceSquared(geometry.centroids[cell] as CellPoint, origin);
    return (
      distance >= nearSpacings * nearSpacings * spacing * spacing &&
      distance <= farSpacings * farSpacings * spacing * spacing
    );
  });
  const pool = band.length > 0 ? band : feet;
  if (pool.length === 0) {
    return [];
  }
  const first = stream.choice(pool);
  const ore = [first];
  terrain[first] = WorldTerrain.IronOreDeposit;
  for (let extra = 0; extra < maxExtraCells; extra += 1) {
    const options = (geometry.adjacency[first] as readonly number[]).filter(
      (cell) =>
        !ore.includes(cell) &&
        !blocked.has(cell) &&
        !excluded.includes(terrain[cell] as string) &&
        terrain[cell] !== WorldTerrain.IronOreDeposit,
    );
    if (options.length > 0 && stream.chancePermille(extraChancePermille)) {
      const next = stream.choice(options);
      ore.push(next);
      terrain[next] = WorldTerrain.IronOreDeposit;
    }
  }
  return ore.sort((left, right) => left - right);
}
