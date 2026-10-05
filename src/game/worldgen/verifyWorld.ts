import type { GameMap } from "../map/GameMap";
import { reachableCells } from "../pathfinding/reachableCells";
import type { VillageLayout } from "./layoutVillage";
import { WorldTerrain } from "./WorldTerrain";

/**
 * Share (percent) of all passable cells that must be reachable from the village.
 */
export const minReachablePercent = 60;

const requiredClasses: readonly WorldTerrain[] = [
  WorldTerrain.WaterShallow,
  WorldTerrain.FertileSoil,
  WorldTerrain.ForestOak,
  WorldTerrain.StoneDeposit,
  WorldTerrain.IronOreDeposit,
];

/**
 * Checks a generated outdoor map against the guarantees of plan task 2.1: every required terrain
 * class exists (water, fertile soil, forest, stone, iron ore), at least one cell of every passable
 * class and of the iron ore deposit is reachable from the village (Dijkstra over the cell graph),
 * the village clearing is fully traversable, and at least {@link minReachablePercent} of all
 * passable cells are reachable.
 *
 * @param map - The painted map.
 * @param village - The village layout of that map.
 * @returns Human readable problems; empty when the map is valid.
 */
export function verifyWorld(map: GameMap, village: VillageLayout): string[] {
  const problems: string[] = [];
  const reached = new Set(reachableCells(map, village.center).map((entry) => entry.cell));
  const present = new Set<string>();
  const reachedClasses = new Set<string>();
  let passable = 0;
  for (let cell = 0; cell < map.cellCount; cell += 1) {
    const id = map.terrainAt(cell);
    present.add(id);
    if (reached.has(cell)) {
      reachedClasses.add(id);
    }
    if (map.isTraversable(cell)) {
      passable += 1;
    }
  }
  for (const terrainClass of requiredClasses) {
    if (!present.has(terrainClass)) {
      problems.push(`no ${terrainClass} cell`);
    } else if (terrainClass !== WorldTerrain.WaterShallow && !reachedClasses.has(terrainClass)) {
      problems.push(`no ${terrainClass} cell is reachable from the village`);
    }
  }
  if (!village.clearing.every((cell) => map.isTraversable(cell))) {
    problems.push("the village clearing is not traversable");
  }
  if (reached.size * 100 < passable * minReachablePercent) {
    problems.push(`only ${reached.size} of ${passable} passable cells are reachable`);
  }
  return problems;
}
