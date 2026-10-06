import { describeCurrentAction } from "../ai/aiViews";
import { healthComponent } from "../ai/needs/healthComponent";
import type { AnimalKind } from "../content/contentTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { positionComponent } from "../map/positionComponent";
import { animalComponent } from "./animalComponent";

/**
 * One animal in the `animals` view.
 */
export type AnimalViewRow = {
  readonly entityId: number;
  readonly prototypeId: string;
  readonly kind: AnimalKind;
  readonly mapId: number | null;
  readonly cellIndex: number | null;
  readonly hungerMilli: number;
  readonly healthMilli: number;
  /**
   * What the animal holds (periodic products), ascending by material id.
   */
  readonly held: readonly { readonly materialId: string; readonly quantity: number }[];
  /**
   * Short description of what it is doing (`idle` without a task).
   */
  readonly action: string;
};

/**
 * The query `animals` (DECISIONS D-140): every live animal, ascending by entity id.
 */
export type AnimalsView = {
  readonly animals: readonly AnimalViewRow[];
};

/**
 * Filter of the `animals` query.
 */
export type AnimalsFilter = {
  kind?: AnimalKind;
  prototypeId?: string;
};

/**
 * Builds the `animals` view.
 *
 * @param engine - The engine to read.
 * @param filter - Optional kind and prototype filter.
 * @returns A fresh view; animals flagged for deletion are left out.
 */
export function buildAnimalsView(engine: GameEngine, filter: AnimalsFilter = {}): AnimalsView {
  const animals: AnimalViewRow[] = [];
  for (const entity of engine.store.entities()) {
    const animal = getComponent(entity, animalComponent);
    if (
      animal === undefined ||
      (filter.kind !== undefined && animal.kind !== filter.kind) ||
      (filter.prototypeId !== undefined && animal.prototypeId !== filter.prototypeId)
    ) {
      continue;
    }
    const position = getComponent(entity, positionComponent);
    const totals = new Map<string, number>();
    for (const slot of getComponent(entity, inventoryComponent)?.slots ?? []) {
      totals.set(slot.materialId, (totals.get(slot.materialId) ?? 0) + slot.quantity);
    }
    animals.push({
      entityId: entity.id,
      prototypeId: animal.prototypeId,
      kind: animal.kind,
      mapId: position?.mapId ?? null,
      cellIndex: position?.cellIndex ?? null,
      hungerMilli: animal.hungerMilli,
      healthMilli: getComponent(entity, healthComponent)?.valueMilli ?? 0,
      held: [...totals.entries()]
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([materialId, quantity]) => ({ materialId, quantity })),
      action: describeCurrentAction(entity),
    });
  }
  return { animals };
}
