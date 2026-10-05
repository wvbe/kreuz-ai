import type { PrngStream } from "../engine/Prng";
import type { CellPoint, MapGeometry } from "../map/mapTypes";
import { voronoiMaxCoordinate, voronoiWorldSize } from "../map/mapTypes";
import { distanceSquared } from "./distanceSquared";
import { integerSqrt } from "./integerSqrt";
import { WorldTerrain } from "./WorldTerrain";

/**
 * Inputs of {@link generateOutdoorTerrain}.
 */
export type OutdoorTerrainOptions = {
  /**
   * Geometry of the voronoi map to paint (centroids and adjacency are read).
   */
  geometry: MapGeometry;
  /**
   * The `world.gen` stream; every random choice is drawn from it in a fixed order.
   */
  stream: PrngStream;
  /**
   * Cell of the settlement; lakes, rivers and forests keep clear of it.
   */
  villageCenter: number;
};

const mountainBandBase = 500;
const lakeKeepOutSpacings = 7;
const riverKeepOutSpacings = 4;
const forestKeepOutSpacings = 3;
const stoneChancePermille = 350;
const fertileChancePermille = 600;
const fordInterval = 6;

/**
 * Typical distance between neighbouring cell centres, `floor(sqrt(area / cells))`.
 *
 * @param cellCount - Number of cells of a voronoi map.
 * @returns The spacing in map units.
 */
export function cellSpacing(cellCount: number): number {
  return integerSqrt(Math.floor((voronoiWorldSize * voronoiWorldSize) / cellCount));
}

function edgeDistance(point: CellPoint): number {
  return Math.min(point.x, point.y, voronoiMaxCoordinate - point.x, voronoiMaxCoordinate - point.y);
}

function nearestEdgeTarget(point: CellPoint): CellPoint {
  const toLeft = point.x;
  const toTop = point.y;
  const toRight = voronoiMaxCoordinate - point.x;
  const toBottom = voronoiMaxCoordinate - point.y;
  const best = Math.min(toLeft, toTop, toRight, toBottom);
  if (best === toLeft) {
    return { x: 0, y: point.y };
  }
  if (best === toTop) {
    return { x: point.x, y: 0 };
  }
  if (best === toRight) {
    return { x: voronoiMaxCoordinate, y: point.y };
  }
  return { x: point.x, y: voronoiMaxCoordinate };
}

/**
 * Paints a whole outdoor map with seeded, noise-free integer rules (spec 004 voronoi generator,
 * DECISIONS D-06): grassland base; mountains in a jittered band along the edges; stone deposits
 * against the mountains; lakes grown cell by cell away from the village; rivers as greedy cell
 * chains from a lake to the nearest edge with a ford every few cells so they never wall off the
 * map; oak forest patches; fertile soil along the water. The iron ore deposit and the village
 * are added afterwards by `placeIronOre` and `layoutVillage`.
 *
 * @param options - Geometry, the `world.gen` stream and the village cell.
 * @returns One terrain id per cell, in cell order.
 */
export function generateOutdoorTerrain(options: OutdoorTerrainOptions): string[] {
  const { geometry, stream } = options;
  const { centroids, adjacency, cellCount } = geometry;
  const spacing = cellSpacing(cellCount);
  const village = centroids[options.villageCenter] as CellPoint;
  const terrain: string[] = new Array<string>(cellCount).fill(WorldTerrain.Grassland);
  const near = (cell: number, spacings: number): boolean =>
    distanceSquared(centroids[cell] as CellPoint, village) <
    spacings * spacings * spacing * spacing;
  const neighborsOf = (cell: number): readonly number[] => adjacency[cell] as readonly number[];

  paintMountains(terrain, geometry, stream, spacing);
  paintStone(terrain, neighborsOf, stream);
  const lakes = paintLakes({ terrain, geometry, stream, spacing, near });
  paintRivers({ terrain, geometry, stream, spacing, near, lakes });
  paintForests({ terrain, neighborsOf, stream, near });
  paintFertileSoil(terrain, neighborsOf, stream);
  return terrain;
}

function paintMountains(
  terrain: string[],
  geometry: MapGeometry,
  stream: PrngStream,
  spacing: number,
): void {
  for (let cell = 0; cell < geometry.cellCount; cell += 1) {
    const noise = stream.nextInt(0, 999);
    const threshold = Math.floor((spacing * (mountainBandBase + noise)) / 1000);
    if (edgeDistance(geometry.centroids[cell] as CellPoint) < threshold) {
      terrain[cell] = WorldTerrain.Mountain;
    }
  }
}

function paintStone(
  terrain: string[],
  neighborsOf: (cell: number) => readonly number[],
  stream: PrngStream,
): void {
  for (let cell = 0; cell < terrain.length; cell += 1) {
    if (
      terrain[cell] === WorldTerrain.Grassland &&
      neighborsOf(cell).some((next) => terrain[next] === WorldTerrain.Mountain) &&
      stream.chancePermille(stoneChancePermille)
    ) {
      terrain[cell] = WorldTerrain.StoneDeposit;
    }
  }
}

type PaintContext = {
  terrain: string[];
  geometry: MapGeometry;
  stream: PrngStream;
  spacing: number;
  near: (cell: number, spacings: number) => boolean;
};

function growFrontier(
  seeds: readonly number[],
  neighborsOf: (cell: number) => readonly number[],
  accept: (cell: number) => boolean,
): number[] {
  const members = new Set(seeds);
  const frontier = new Set<number>();
  for (const cell of seeds) {
    for (const next of neighborsOf(cell)) {
      if (!members.has(next) && accept(next)) {
        frontier.add(next);
      }
    }
  }
  return [...frontier].sort((left, right) => left - right);
}

function paintLakes(context: PaintContext): number[][] {
  const { terrain, geometry, stream, spacing, near } = context;
  const lakes: number[][] = [];
  const lakeCount = 1 + Math.floor(geometry.cellCount / 500);
  const neighborsOf = (cell: number): readonly number[] => geometry.adjacency[cell] as number[];
  const allowed = (cell: number): boolean =>
    terrain[cell] === WorldTerrain.Grassland &&
    !near(cell, lakeKeepOutSpacings) &&
    edgeDistance(geometry.centroids[cell] as CellPoint) > 3 * spacing;
  for (let lake = 0; lake < lakeCount; lake += 1) {
    const candidates: number[] = [];
    for (let cell = 0; cell < geometry.cellCount; cell += 1) {
      if (allowed(cell) && edgeDistance(geometry.centroids[cell] as CellPoint) > 4 * spacing) {
        candidates.push(cell);
      }
    }
    if (candidates.length === 0) {
      break;
    }
    const first = stream.choice(candidates);
    const cells = [first];
    terrain[first] = WorldTerrain.WaterShallow;
    const target = 5 + stream.nextInt(0, 4) + Math.floor(geometry.cellCount / 300);
    while (cells.length < target) {
      const frontier = growFrontier(cells, neighborsOf, allowed);
      if (frontier.length === 0) {
        break;
      }
      const next = stream.choice(frontier);
      cells.push(next);
      terrain[next] = WorldTerrain.WaterShallow;
    }
    lakes.push(cells);
  }
  return lakes;
}

function paintRivers(context: PaintContext & { lakes: readonly number[][] }): void {
  const { terrain, geometry, stream, spacing, near, lakes } = context;
  if (lakes.length === 0) {
    return;
  }
  const riverCount = 1 + Math.floor(geometry.cellCount / 1000);
  const maxSteps = 4 * integerSqrt(geometry.cellCount);
  const noiseRange = spacing * spacing;
  for (let river = 0; river < riverCount; river += 1) {
    const lake = lakes[river % lakes.length] as number[];
    let current = stream.choice(lake);
    const target = nearestEdgeTarget(geometry.centroids[current] as CellPoint);
    const visited = new Set<number>([current]);
    for (let step = 0; step < maxSteps; step += 1) {
      let best = -1;
      let bestScore = Number.MAX_SAFE_INTEGER;
      for (const next of geometry.adjacency[current] as readonly number[]) {
        if (visited.has(next) || near(next, riverKeepOutSpacings)) {
          continue;
        }
        const score =
          distanceSquared(geometry.centroids[next] as CellPoint, target) +
          stream.nextInt(0, noiseRange);
        if (score < bestScore) {
          best = next;
          bestScore = score;
        }
      }
      if (best === -1 || terrain[best] === WorldTerrain.Mountain) {
        break;
      }
      visited.add(best);
      current = best;
      if (step % fordInterval !== fordInterval - 1) {
        terrain[best] = WorldTerrain.WaterShallow;
      }
    }
  }
}

function paintForests(context: {
  terrain: string[];
  neighborsOf: (cell: number) => readonly number[];
  stream: PrngStream;
  near: (cell: number, spacings: number) => boolean;
}): void {
  const { terrain, neighborsOf, stream, near } = context;
  const patchCount = Math.floor(terrain.length / 40);
  const allowed = (cell: number): boolean =>
    terrain[cell] === WorldTerrain.Grassland && !near(cell, forestKeepOutSpacings);
  for (let patch = 0; patch < patchCount; patch += 1) {
    const candidates: number[] = [];
    for (let cell = 0; cell < terrain.length; cell += 1) {
      if (allowed(cell)) {
        candidates.push(cell);
      }
    }
    if (candidates.length === 0) {
      return;
    }
    const first = stream.choice(candidates);
    const cells = [first];
    terrain[first] = WorldTerrain.ForestOak;
    const target = 2 + stream.nextInt(0, 5);
    while (cells.length < target) {
      const frontier = growFrontier(cells, neighborsOf, allowed);
      if (frontier.length === 0) {
        break;
      }
      const next = stream.choice(frontier);
      cells.push(next);
      terrain[next] = WorldTerrain.ForestOak;
    }
  }
}

function paintFertileSoil(
  terrain: string[],
  neighborsOf: (cell: number) => readonly number[],
  stream: PrngStream,
): void {
  const shore: number[] = [];
  for (let cell = 0; cell < terrain.length; cell += 1) {
    if (
      terrain[cell] === WorldTerrain.Grassland &&
      neighborsOf(cell).some((next) => terrain[next] === WorldTerrain.WaterShallow)
    ) {
      shore.push(cell);
    }
  }
  for (const cell of shore) {
    if (stream.chancePermille(fertileChancePermille)) {
      terrain[cell] = WorldTerrain.FertileSoil;
    }
  }
}
