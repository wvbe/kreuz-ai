import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { getTotal } from "../inventory/inventoryQueries";
import { activePostingsOfType } from "../jobs/jobBoards";
import { positionComponent } from "../map/positionComponent";
import { skillLevel } from "../skills/skillLevels";
import { stockOf } from "../storage/storageQueries";
import { getStorageService } from "../storage/storageServiceRegistry";
import type { RecipeContent } from "../content/schemas/economySchemas";
import { getZoneService } from "../zones/zoneServiceRegistry";
import { isInActiveZoneOfType } from "../zones/zoneQueries";
import { firstOutputMisfit } from "./firstOutputMisfit";
import { productionOrdersComponent } from "./productionOrdersComponent";
import {
  canMake,
  isRecipeLocked,
  listWorkstations,
  requireOrder,
  requireWorkstation,
} from "./productionQueries";
import { CauseSubjectKind, OrderStatus, ProductionBlockedKind } from "./productionTypes";
import type {
  CauseRef,
  OrderExplanation,
  ProductionBlockedReason,
  ProductionOrder,
} from "./productionTypes";

function reason(
  kind: ProductionBlockedKind,
  params: ProductionBlockedReason["params"] = {},
  causeRef: CauseRef | null = null,
): ProductionBlockedReason {
  return { kind, params, causeRef };
}

/**
 * How many units of a material a craft at a workstation could still count on: what the
 * workstation inventory holds unreserved plus what claimable storage offers unreserved (the
 * crafter fetches the rest from storage).
 *
 * @param engine - The engine.
 * @param station - The workstation entity.
 * @param materialId - Registered material id.
 * @returns Available units.
 */
export function availableForCraft(engine: GameEngine, station: Entity, materialId: string): number {
  return (
    getStorageService(engine).reservations.availableTo(station.id, materialId, null) +
    stockOf(engine, materialId).available
  );
}

/**
 * Whether at least one citizen has the recipe's skill level (any citizen when the recipe asks for
 * no level). Claiming additionally depends on the posting's eligibility.
 *
 * @param engine - The engine.
 * @param recipe - The recipe.
 * @returns True when somebody could craft it.
 */
export function hasQualifiedWorker(engine: GameEngine, recipe: RecipeContent): boolean {
  return engine.store
    .entities()
    .some(
      (entity) =>
        hasComponent(entity, citizenComponent) &&
        (recipe.skillId === null ||
          recipe.minSkillLevel === 0 ||
          skillLevel(entity, recipe.skillId) >= recipe.minSkillLevel),
    );
}

function isServed(station: Entity, order: ProductionOrder): boolean {
  const craft = getComponent(station, productionOrdersComponent)?.craft;
  return order.postingId !== null || (craft !== null && craft?.orderId === order.orderId);
}

/**
 * The cause of a missing input (spec 025 FR-009): the producers of the material are the active
 * orders whose recipe outputs it and the open or claimed postings of job types that list it as
 * an output. Any served producer: no cause. Otherwise the first producer that is not served.
 * No producer at all: `noProducer`.
 *
 * @param engine - The engine.
 * @param materialId - The missing material.
 * @param exceptOrderId - The order that misses it (it is not its own producer).
 * @returns `noProducer` and the cause pointing at the first stalled producer's workstation.
 */
export function inputProducer(
  engine: GameEngine,
  materialId: string,
  exceptOrderId: number,
): { noProducer: boolean; causeRef: CauseRef | null } {
  let stalled: CauseRef | null = null;
  let any = false;
  for (const station of listWorkstations(engine)) {
    for (const order of getComponent(station, productionOrdersComponent)?.orders ?? []) {
      const recipe = engine.content.recipes.find(order.recipeId);
      if (
        order.orderId === exceptOrderId ||
        order.status !== OrderStatus.Active ||
        order.remaining < 1 ||
        recipe === undefined ||
        !recipe.outputs.some((output) => output.materialId === materialId)
      ) {
        continue;
      }
      any = true;
      if (isServed(station, order)) {
        return { noProducer: false, causeRef: null };
      }
      stalled ??= { kind: CauseSubjectKind.Workstation, entityId: station.id };
    }
  }
  for (const jobType of engine.content.jobs.all()) {
    if (
      jobType.outputs.some((output) => output.materialId === materialId) &&
      activePostingsOfType(engine, jobType.id).length > 0
    ) {
      return { noProducer: false, causeRef: null };
    }
  }
  return { noProducer: !any, causeRef: stalled };
}

function roomCause(engine: GameEngine, station: Entity): CauseRef | null {
  const place = getComponent(station, positionComponent);
  const zoneId =
    place === undefined ? null : getZoneService(engine).zoneIdAt(place.mapId, place.cellIndex);
  return zoneId === null ? null : { kind: CauseSubjectKind.Zone, entityId: zoneId };
}

/**
 * The structured reasons why an order cannot start a craft now, empty when nothing blocks it. The
 * poster only posts an order for which this is empty, and `explainOrder` returns it for spec 025.
 * Order of the list (025 FR-004): `LockedByTier`, `MissingWorkstation`, `MissingRoom`,
 * `NoQualifiedWorker`, `MissingTool`, `MissingInput` (recipe input order), `OutputBlocked`. The
 * order's own status (`Paused`) is handled by {@link explainOrder}.
 *
 * @param engine - The engine.
 * @param station - The workstation entity that holds the order.
 * @param order - The order.
 * @returns Reasons, possibly empty.
 */
export function orderBlockers(
  engine: GameEngine,
  station: Entity,
  order: ProductionOrder,
): ProductionBlockedReason[] {
  const recipe = engine.content.recipes.find(order.recipeId);
  if (recipe === undefined) {
    return [reason(ProductionBlockedKind.MissingWorkstation, { workstationTag: order.recipeId })];
  }
  const reasons: ProductionBlockedReason[] = [];
  if (isRecipeLocked(engine, recipe)) {
    reasons.push(
      reason(ProductionBlockedKind.LockedByTier, {
        contentKind: "recipe",
        contentId: recipe.id,
        requiredTier: recipe.unlockTier ?? "",
      }),
    );
  }
  if (!canMake(engine, station, recipe)) {
    reasons.push(
      reason(ProductionBlockedKind.MissingWorkstation, { workstationTag: recipe.workstationTag }),
    );
  }
  const place = getComponent(station, positionComponent);
  if (
    recipe.roomZoneId !== undefined &&
    (place === undefined ||
      !isInActiveZoneOfType(engine, place.mapId, place.cellIndex, recipe.roomZoneId))
  ) {
    reasons.push(
      reason(
        ProductionBlockedKind.MissingRoom,
        { zoneTypeId: recipe.roomZoneId },
        roomCause(engine, station),
      ),
    );
  }
  if (!hasQualifiedWorker(engine, recipe)) {
    reasons.push(
      reason(ProductionBlockedKind.NoQualifiedWorker, {
        skillId: recipe.skillId,
        requiredLevel: recipe.minSkillLevel,
      }),
    );
  }
  for (const tool of recipe.toolMaterialIds) {
    if (availableForCraft(engine, station, tool) < 1) {
      reasons.push(reason(ProductionBlockedKind.MissingTool, { tag: tool }));
    }
  }
  const consumed: { materialId: string; quantity: number }[] = [];
  for (const input of recipe.inputs) {
    const available = availableForCraft(engine, station, input.materialId);
    if (available < input.quantity) {
      const producer = inputProducer(engine, input.materialId, order.orderId);
      reasons.push(
        reason(
          ProductionBlockedKind.MissingInput,
          {
            materialId: input.materialId,
            required: input.quantity,
            available,
            noProducer: producer.noProducer,
          },
          producer.causeRef,
        ),
      );
    }
    consumed.push({
      materialId: input.materialId,
      quantity: Math.min(input.quantity, getTotal(station, input.materialId)),
    });
  }
  const misfit = firstOutputMisfit(
    engine,
    station,
    consumed.filter((item) => item.quantity > 0),
    recipe.outputs,
  );
  if (misfit !== null) {
    reasons.push(reason(ProductionBlockedKind.OutputBlocked, { materialId: misfit }));
  }
  return reasons;
}

/**
 * Explains one order for the status system (spec 025, `explainOrder` of plan task 3.3): its status
 * and the structured reasons why it does not progress. A paused order reports `Paused`, a finished
 * order no reason, an active order the {@link orderBlockers}. Pure: it reads state only.
 *
 * @param engine - The engine.
 * @param orderId - Order id.
 * @returns The explanation.
 * @throws ProductionError `UnknownOrder` for an unknown order.
 */
export function explainOrder(engine: GameEngine, orderId: number): OrderExplanation {
  const { station, order } = requireOrder(engine, orderId);
  let reasons: ProductionBlockedReason[] = [];
  if (order.status === OrderStatus.Paused) {
    reasons = [reason(ProductionBlockedKind.Paused, { productionOrderId: order.orderId })];
  } else if (order.status === OrderStatus.Active) {
    reasons = orderBlockers(engine, station, order);
  }
  return { orderId, workstationId: station.id, status: order.status, reasons };
}

/**
 * Explains a workstation (spec 025 subject `Workstation`): `NoOrders` when it has no active order
 * (the Idle state), otherwise the reasons of its highest-priority active order that is not served
 * yet (empty while it crafts or an order is posted and waits for a crafter).
 *
 * @param engine - The engine.
 * @param workstationId - Workstation entity id.
 * @returns Reasons, empty when the workstation is busy or served.
 * @throws ProductionError `UnknownEntity` when it is not a workstation.
 */
export function explainWorkstation(
  engine: GameEngine,
  workstationId: number,
): ProductionBlockedReason[] {
  const { station, data } = requireWorkstation(engine, workstationId);
  const active = data.orders
    .filter((order) => order.status === OrderStatus.Active && order.remaining > 0)
    .sort((left, right) => right.priority - left.priority || left.orderId - right.orderId);
  if (active.length === 0) {
    return [reason(ProductionBlockedKind.NoOrders)];
  }
  if (data.craft !== null || active.some((order) => order.postingId !== null)) {
    return [];
  }
  const first = active[0];
  return first === undefined ? [] : orderBlockers(engine, station, first);
}
