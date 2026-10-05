import { NeedSatisfactionKind } from "../../content/contentTypes";
import type { NeedContent } from "../../content/schemas/characterSchemas";
import { getComponent, hasComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import { combineMilli } from "../../inventory/inventoryMath";
import { inventoryComponent } from "../../inventory/inventoryComponent";
import { getTotal } from "../../inventory/inventoryQueries";
import type { GameEngine } from "../../engine/GameEngine";
import { positionComponent } from "../../map/positionComponent";
import { PathResultKind } from "../../pathfinding/pathTypes";
import { getAiService } from "../aiServiceRegistry";
import { NeedPlanKind } from "./needPlanTypes";
import type { NeedPlan } from "./needPlanTypes";

function findNearestBed(
  engine: GameEngine,
  entity: Entity,
  prototypeId: string,
): { bedId: number; cellIndex: number } | null {
  const position = getComponent(entity, positionComponent);
  if (position === undefined) {
    return null;
  }
  const pathfinding = getAiService(engine).pathfinding;
  let best: { bedId: number; cellIndex: number; cost: number } | null = null;
  for (const candidate of engine.store.entities()) {
    if (candidate.prototype !== prototypeId) {
      continue;
    }
    const bedPosition = getComponent(candidate, positionComponent);
    if (bedPosition === undefined || bedPosition.mapId !== position.mapId) {
      continue;
    }
    const path = pathfinding.findPath(position.mapId, position.cellIndex, bedPosition.cellIndex);
    const cost =
      path.kind === PathResultKind.Found
        ? path.cost
        : path.kind === PathResultKind.AlreadyThere
          ? 0
          : null;
    if (cost !== null && (best === null || cost < best.cost)) {
      best = { bedId: candidate.id, cellIndex: bedPosition.cellIndex, cost };
    }
  }
  return best === null ? null : { bedId: best.bedId, cellIndex: best.cellIndex };
}

/**
 * Finds a concrete way to satisfy a need right now (spec 013 FR-002, plan 2.4 "inventory first,
 * then known sources"). The authored `satisfactionMethods` are tried in order:
 * - `Item`: the entity's own inventory first; otherwise the registered need source finders (see
 *   `AiService.registerNeedSource`), first plan wins.
 * - `Furniture`: the nearest reachable entity of that prototype (a bed) on the same map; ties go
 *   to the lowest entity id.
 * - `Zone`: not supported yet.
 *
 * A need with a furniture method and no reachable furniture falls back to sleeping on the ground
 * where the entity stands, at `groundSleepRate` of the authored amount (DECISIONS D-45).
 *
 * @param engine - The engine.
 * @param entity - The entity that needs something; it needs a `Position`.
 * @param need - The need to satisfy.
 * @returns A plan, or null when nothing can satisfy the need now.
 */
export function planNeed(engine: GameEngine, entity: Entity, need: NeedContent): NeedPlan | null {
  const position = getComponent(entity, positionComponent);
  if (position === undefined) {
    return null;
  }
  let groundAmount: number | null = null;
  for (const method of need.satisfactionMethods) {
    if (method.kind === NeedSatisfactionKind.Item) {
      if (hasComponent(entity, inventoryComponent) && getTotal(entity, method.ref) > 0) {
        return {
          kind: NeedPlanKind.Consume,
          needId: need.id,
          sourceId: entity.id,
          materialId: method.ref,
          mapId: position.mapId,
          cellIndex: position.cellIndex,
          amountMilli: method.amount,
        };
      }
      for (const finder of getAiService(engine).needSources()) {
        const plan = finder(engine, entity, need, method);
        if (plan !== null) {
          return plan;
        }
      }
    } else if (method.kind === NeedSatisfactionKind.Furniture) {
      const bed = findNearestBed(engine, entity, method.ref);
      if (bed !== null) {
        return {
          kind: NeedPlanKind.Sleep,
          needId: need.id,
          sourceId: bed.bedId,
          materialId: null,
          mapId: position.mapId,
          cellIndex: bed.cellIndex,
          amountMilli: method.amount,
        };
      }
      groundAmount ??= combineMilli(method.amount, engine.content.constants.groundSleepRate);
    }
  }
  if (groundAmount === null) {
    return null;
  }
  return {
    kind: NeedPlanKind.Sleep,
    needId: need.id,
    sourceId: null,
    materialId: null,
    mapId: position.mapId,
    cellIndex: position.cellIndex,
    amountMilli: groundAmount,
  };
}
