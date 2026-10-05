import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import type { MaterialRegistry } from "../inventory/MaterialRegistry";
import { furnitureComponent } from "./furnitureComponent";
import { StorageError, StorageErrorKind } from "./StorageError";
import { stockpileComponent } from "./stockpileComponent";
import type { MaterialFilter } from "./storageTypes";

/**
 * The filter shape a command may send: either list may be missing.
 */
export type FilterInput = {
  categories?: readonly string[];
  materialIds?: readonly string[];
};

/**
 * Turns a filter input into the stored shape (DECISIONS D-26): missing lists become `[]`, ids are
 * de-duplicated and sorted so equal filters serialize equally, and a filter whose lists are both
 * empty is absent (`null`, accepts everything).
 *
 * @param input - The filter as sent, or null.
 * @returns The stored filter, or null for "accept all".
 */
export function normalizeFilter(input: FilterInput | null): MaterialFilter | null {
  if (input === null) {
    return null;
  }
  const categories = [...new Set(input.categories ?? [])].sort();
  const materialIds = [...new Set(input.materialIds ?? [])].sort();
  return categories.length === 0 && materialIds.length === 0 ? null : { categories, materialIds };
}

/**
 * Checks a filter against the content pack: every category and material must exist.
 *
 * @param engine - The engine with the content.
 * @param filter - The normalized filter, or null.
 */
export function assertFilterKnown(engine: GameEngine, filter: MaterialFilter | null): void {
  for (const category of filter?.categories ?? []) {
    if (!engine.content.categories.has(category)) {
      throw new StorageError(
        StorageErrorKind.UnknownCategory,
        `category "${category}" is not in the content pack`,
      );
    }
  }
  for (const materialId of filter?.materialIds ?? []) {
    if (!engine.materials.has(materialId)) {
      throw new StorageError(
        StorageErrorKind.UnknownMaterial,
        `material "${materialId}" is not in the content pack`,
      );
    }
  }
}

/**
 * Whether a filter accepts a material (spec 018 FR-005): no filter accepts everything, otherwise
 * the material id is listed or one of its categories is.
 *
 * @param materials - Material registry (the id must be registered).
 * @param filter - The filter, or null.
 * @param materialId - The material to deposit.
 * @returns True when the material may be deposited.
 */
export function filterAccepts(
  materials: MaterialRegistry,
  filter: MaterialFilter | null,
  materialId: string,
): boolean {
  if (filter === null || (filter.categories.length === 0 && filter.materialIds.length === 0)) {
    return true;
  }
  if (filter.materialIds.includes(materialId)) {
    return true;
  }
  return materials
    .require(materialId)
    .categories.some((category) => filter.categories.includes(category));
}

/**
 * The filter in force for a storage entity (DECISIONS D-26): the `Stockpile` filter when one is
 * set (it replaces, never merges with, the default), otherwise the default filter of the
 * furniture content (`storage.categoryFilter`, an empty list is no filter), otherwise none.
 *
 * @param engine - The engine with the content.
 * @param entity - The storage entity.
 * @returns The effective filter, or null for "accepts everything".
 */
export function effectiveFilter(engine: GameEngine, entity: Entity): MaterialFilter | null {
  const own = getComponent(entity, stockpileComponent)?.filter ?? null;
  if (own !== null) {
    return own;
  }
  const furniture = getComponent(entity, furnitureComponent);
  const categories =
    furniture === undefined
      ? []
      : (engine.content.furniture.find(furniture.furnitureId)?.storage?.categoryFilter ?? []);
  return normalizeFilter({ categories });
}
