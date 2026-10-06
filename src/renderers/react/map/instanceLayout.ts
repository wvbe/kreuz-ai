import type { MapEntityView } from "../../../game/api/Views";
import type { GroundPoint } from "./cameraMath";
import { isInBounds } from "./cull";
import type { GroundBounds } from "./cull";
import { classifyEntity, entityColor, VisualKind } from "./entityVisuals";
import type { MapScene } from "./mapScene";

/**
 * One drawn primitive: where it stands and how it looks. Plain numbers so the layer can write
 * them straight into an instanced mesh.
 */
export type VisualInstance = {
  entityId: number;
  kind: VisualKind;
  cell: number;
  x: number;
  y: number;
  z: number;
  /**
   * Turn about the vertical axis in radians.
   */
  rotation: number;
  color: number;
  /**
   * Doors only: whether a mobile entity stands in the doorway (the leaf swings open, FR-016).
   */
  open: boolean;
};

/**
 * The growth state of one planted cell as the renderer needs it.
 */
export type CropCell = {
  cellIndex: number;
  /**
   * Stage name of the `crops` query (`Fallow`, `Sown`, `Ripe`).
   */
  stage: string;
  growthPermille: number;
};

/**
 * One drawn crop plant.
 */
export type CropInstance = {
  cell: number;
  x: number;
  z: number;
  /**
   * Plant height in world units, from the growth.
   */
  height: number;
  color: number;
};

const spreadRadius = 0.24;
const cullMargin = 1.5;

function wallLike(kind: VisualKind): boolean {
  return (
    kind === VisualKind.Wall ||
    kind === VisualKind.Door ||
    kind === VisualKind.Furniture ||
    kind === VisualKind.NoticePost ||
    kind === VisualKind.BuildSite ||
    kind === VisualKind.Marker
  );
}

/**
 * Places the entities of a map for drawing: grouped by visual kind, only those inside the
 * visible ground (culling), mobile ones fanned around the cell centre when several share a cell.
 * Deterministic: the order and offsets depend only on entity ids and cells.
 *
 * @param entities - Rows of the `map-entities` view.
 * @param scene - The map in world coordinates.
 * @param bounds - The visible ground, or null to lay out everything.
 * @returns The instances per kind, in entity id order.
 */
export function layoutEntities(
  entities: readonly MapEntityView[],
  scene: MapScene,
  bounds: GroundBounds | null,
): Map<VisualKind, VisualInstance[]> {
  const byKind = new Map<VisualKind, VisualInstance[]>();
  const mobileOnCell = new Map<number, number>();
  const occupied = new Set<number>();
  for (const entity of entities) {
    if (!wallLike(classifyEntity(entity))) {
      occupied.add(entity.cell);
    }
  }
  for (const entity of entities) {
    const center: GroundPoint | undefined = scene.centers[entity.cell];
    if (center === undefined) {
      continue;
    }
    const kind = classifyEntity(entity);
    let offsetX = 0;
    let offsetZ = 0;
    if (!wallLike(kind)) {
      const slot = mobileOnCell.get(entity.cell) ?? 0;
      mobileOnCell.set(entity.cell, slot + 1);
      if (slot > 0) {
        const angle = slot * 2.399963;
        offsetX = Math.cos(angle) * spreadRadius;
        offsetZ = Math.sin(angle) * spreadRadius;
      }
    }
    const point = { x: center.x + offsetX, z: center.z + offsetZ };
    if (!isInBounds(point, bounds, cullMargin)) {
      continue;
    }
    const list = byKind.get(kind) ?? [];
    list.push({
      entityId: entity.id,
      kind,
      cell: entity.cell,
      x: point.x,
      y: 0,
      z: point.z,
      rotation: ((entity.id * 37) % 8) * (Math.PI / 4),
      color: entityColor(kind, entity.prototype),
      open: kind === VisualKind.Door && occupied.has(entity.cell),
    });
    byKind.set(kind, list);
  }
  return byKind;
}

/**
 * Places the crop plants of the planted cells.
 *
 * @param crops - Cells of the `crops` query.
 * @param scene - The map in world coordinates.
 * @param bounds - The visible ground, or null for all.
 * @returns One plant per sown or ripe cell, in the order given.
 */
export function layoutCrops(
  crops: readonly CropCell[],
  scene: MapScene,
  bounds: GroundBounds | null,
): CropInstance[] {
  const plants: CropInstance[] = [];
  for (const crop of crops) {
    const center = scene.centers[crop.cellIndex];
    if (
      center === undefined ||
      crop.stage === "Fallow" ||
      !isInBounds(center, bounds, cullMargin)
    ) {
      continue;
    }
    const ripe = crop.stage === "Ripe";
    plants.push({
      cell: crop.cellIndex,
      x: center.x,
      z: center.z,
      height: 0.12 + (Math.min(1000, Math.max(0, crop.growthPermille)) / 1000) * 0.4,
      color: ripe ? 0xe0c040 : 0x4fa84a,
    });
  }
  return plants;
}
