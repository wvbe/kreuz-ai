import type { MapGeometry } from "../map/mapTypes";
import { WorldTerrain } from "./WorldTerrain";

const walkable: readonly string[] = [
  WorldTerrain.Grassland,
  WorldTerrain.FertileSoil,
  WorldTerrain.ForestOak,
  WorldTerrain.StoneDeposit,
  WorldTerrain.IronOreDeposit,
  WorldTerrain.RoadDirt,
  WorldTerrain.FloorWood,
  WorldTerrain.CaveFloor,
];

/**
 * Last-resort repair: finds the shortest cell chain (breadth first, ignoring terrain, neighbours
 * ascending so ties are stable) from `start` to `goal` and turns every blocking cell on it into
 * grassland.
 *
 * @param geometry - Geometry whose adjacency is walked.
 * @param terrain - Terrain list to modify in place.
 * @param start - Start cell.
 * @param goal - Goal cell.
 * @returns The cells of the chain including both ends; empty when `goal` cannot be reached at all.
 */
export function carvePath(
  geometry: MapGeometry,
  terrain: string[],
  start: number,
  goal: number,
): number[] {
  const parent = new Map<number, number>([[start, start]]);
  const queue = [start];
  for (let head = 0; head < queue.length && !parent.has(goal); head += 1) {
    const cell = queue[head] as number;
    for (const next of geometry.adjacency[cell] as readonly number[]) {
      if (!parent.has(next)) {
        parent.set(next, cell);
        queue.push(next);
      }
    }
  }
  if (!parent.has(goal)) {
    return [];
  }
  const chain = [goal];
  for (let cell = goal; cell !== start;) {
    cell = parent.get(cell) as number;
    chain.push(cell);
  }
  chain.reverse();
  for (const cell of chain) {
    if (!walkable.includes(terrain[cell] as string)) {
      terrain[cell] = WorldTerrain.Grassland;
    }
  }
  return chain;
}
