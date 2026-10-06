import type { MapEntityView } from "../../../game/api/Views";
import { classifyEntity, VisualKind } from "./entityVisuals";

/**
 * Entities of a map by cell, built once per `map-entities` result.
 */
export type CellEntityIndex = ReadonlyMap<number, readonly MapEntityView[]>;

/**
 * Which kinds win when several entities share a cell: what the player most likely means.
 */
const pickOrder: readonly VisualKind[] = [
  VisualKind.Citizen,
  VisualKind.Trader,
  VisualKind.Livestock,
  VisualKind.Door,
  VisualKind.Furniture,
  VisualKind.BuildSite,
  VisualKind.Wall,
  VisualKind.Marker,
];

/**
 * Groups entities by their cell.
 *
 * @param entities - Rows of the `map-entities` view.
 * @returns The index.
 */
export function buildCellEntityIndex(entities: readonly MapEntityView[]): CellEntityIndex {
  const index = new Map<number, MapEntityView[]>();
  for (const entity of entities) {
    const list = index.get(entity.cell);
    if (list === undefined) {
      index.set(entity.cell, [entity]);
    } else {
      list.push(entity);
    }
  }
  return index;
}

/**
 * Chooses the entity a click on a cell means (spec 024 FR-005): citizens and traders before
 * furniture before walls; the lowest id among equals.
 *
 * @param index - Entities by cell.
 * @param cell - The picked cell.
 * @returns The entity, or null when the cell holds none.
 */
export function pickEntity(index: CellEntityIndex, cell: number): MapEntityView | null {
  const candidates = index.get(cell);
  if (candidates === undefined || candidates.length === 0) {
    return null;
  }
  let best: MapEntityView | null = null;
  let bestRank = Infinity;
  for (const candidate of candidates) {
    const rank = pickOrder.indexOf(classifyEntity(candidate));
    if (rank < bestRank || (rank === bestRank && best !== null && candidate.id < best.id)) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best;
}
