import type { NeedContent } from "../../content/schemas/characterSchemas";
import { getComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import type { ContentTable } from "../../content/ContentTable";
import { maxMeterMilli } from "../aiTypes";
import type { NeedValue } from "../aiTypes";
import { isCritical } from "./needMath";
import { needsComponent } from "./needsComponent";

/**
 * Builds the initial `Needs` data: every need of the pack at the same start value, ascending by
 * need id (`needStartValue` of the content constants).
 *
 * @param needs - The need records.
 * @param startValueMilli - Start level in milli-percent.
 * @returns Need values ready for the `Needs` component.
 */
export function initialNeedValues(
  needs: readonly NeedContent[],
  startValueMilli: number,
): NeedValue[] {
  return needs
    .map((need) => ({ needId: need.id, valueMilli: startValueMilli }))
    .sort((left, right) => (left.needId < right.needId ? -1 : left.needId > right.needId ? 1 : 0));
}

/**
 * Reads one need level.
 *
 * @param entity - Entity with a `Needs` component.
 * @param needId - Need id.
 * @returns Milli-percent, or null when the entity has no such need.
 */
export function getNeedValue(entity: Entity, needId: string): number | null {
  const needs = getComponent(entity, needsComponent);
  return needs?.values.find((value) => value.needId === needId)?.valueMilli ?? null;
}

/**
 * Changes one need level by a signed amount, clamped to `0..100000`.
 *
 * @param entity - Entity with a `Needs` component.
 * @param needId - Need id.
 * @param deltaMilli - Signed milli-percent.
 * @returns The new level, or null when the entity has no such need.
 */
export function adjustNeed(entity: Entity, needId: string, deltaMilli: number): number | null {
  const slot = getComponent(entity, needsComponent)?.values.find(
    (value) => value.needId === needId,
  );
  if (slot === undefined) {
    return null;
  }
  slot.valueMilli = Math.min(maxMeterMilli, Math.max(0, slot.valueMilli + deltaMilli));
  return slot.valueMilli;
}

/**
 * The needs of an entity that are critical, in content file order.
 *
 * @param needs - The need table.
 * @param entity - Entity with a `Needs` component (none: nothing is critical).
 * @returns The critical need records.
 */
export function criticalNeedsOf(needs: ContentTable<NeedContent>, entity: Entity): NeedContent[] {
  const critical: NeedContent[] = [];
  for (const need of needs.all()) {
    const value = getNeedValue(entity, need.id);
    if (value !== null && isCritical(need, value)) {
      critical.push(need);
    }
  }
  return critical;
}
