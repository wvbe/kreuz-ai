/**
 * What the zone geometry needs of a map: the adjacency of cells (both grid kinds provide it).
 */
export type CellGraph = {
  neighbors: (cell: number) => readonly number[];
};

/**
 * Splits a set of cells into its connected components by cell adjacency (4-neighbours on square
 * maps, Delaunay neighbours on Voronoi maps), so zones are grid-agnostic.
 *
 * @param graph - The map (or any adjacency).
 * @param cells - Cell indices; duplicates are ignored.
 * @returns The components, each ascending, ordered ascending by their lowest cell.
 */
export function connectedComponents(graph: CellGraph, cells: readonly number[]): number[][] {
  const remaining = new Set(cells);
  const sorted = [...remaining].sort((left, right) => left - right);
  const components: number[][] = [];
  for (const start of sorted) {
    if (!remaining.has(start)) {
      continue;
    }
    remaining.delete(start);
    const component = [start];
    for (let index = 0; index < component.length; index += 1) {
      for (const next of graph.neighbors(component[index] ?? start)) {
        if (remaining.delete(next)) {
          component.push(next);
        }
      }
    }
    components.push(component.sort((left, right) => left - right));
  }
  return components;
}

/**
 * The cells next to a set of cells that are not in it (the outer ring), ascending. This is where
 * a room's walls must stand.
 *
 * @param graph - The map (or any adjacency).
 * @param cells - The set, for example a zone's tiles.
 * @returns The distinct bordering cells outside the set.
 */
export function outerRing(graph: CellGraph, cells: readonly number[]): number[] {
  const inside = new Set(cells);
  const ring = new Set<number>();
  for (const cell of cells) {
    for (const next of graph.neighbors(cell)) {
      if (!inside.has(next)) {
        ring.add(next);
      }
    }
  }
  return [...ring].sort((left, right) => left - right);
}
