import { NeedPlanKind } from "../ai/decision/needPlanTypes";
import type { NeedSourceFinder } from "../ai/decision/needPlanTypes";
import { getComponent } from "../ecs/Entity";
import { positionComponent } from "../map/positionComponent";
import { findSources } from "./storageQueries";

/**
 * The need source finder of storage (spec 018 FR-011, plan 3.2): a settler whose `Item` need
 * cannot be met from its own inventory (hungry, bread in the stockpile) gets a `Consume` plan on
 * the nearest reachable storage that holds the material, that it may take from and whose stock is
 * not reserved by somebody else. Ties go to the lowest entity id. Register it with
 * `AiService.registerNeedSource` (the storage system does this for itself).
 *
 * @param engine - The engine.
 * @param entity - The settler with the need; it needs a `Position`.
 * @param need - The need to satisfy.
 * @param method - The authored `Item` method; `method.ref` is the material.
 * @returns A plan, or null when no storage can give the item.
 */
export const storageNeedSource: NeedSourceFinder = (engine, entity, need, method) => {
  if (getComponent(entity, positionComponent) === undefined) {
    return null;
  }
  const source = findSources(engine, entity, method.ref, 1)[0];
  return source === undefined
    ? null
    : {
        kind: NeedPlanKind.Consume,
        needId: need.id,
        sourceId: source.entityId,
        materialId: method.ref,
        mapId: source.mapId,
        cellIndex: source.cellIndex,
        amountMilli: method.amount,
      };
};
