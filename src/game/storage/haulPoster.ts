import { getAiService } from "../ai/aiServiceRegistry";
import { citizenComponent } from "../factions/citizenComponent";
import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { getAllItems } from "../inventory/inventoryQueries";
import { jobBoardComponent } from "../jobs/jobBoardComponent";
import { activePostingsOfType, isBoardPaused, listBoards } from "../jobs/jobBoards";
import { cancelPosting, postJob } from "../jobs/jobPostings";
import { PostingStatus } from "../jobs/jobTypes";
import type { JobPosting } from "../jobs/jobTypes";
import { positionComponent } from "../map/positionComponent";
import { isLoosePile } from "./storageQueries";
import { chooseRoute } from "./storageRouting";
import { getStorageService } from "./storageServiceRegistry";
import {
  haulJobId,
  haulPosterIntervalTicks,
  noDestinationEvent,
  noDestinationReason,
  ReservationKind,
  sourceGoneReason,
} from "./storageTypes";
import type { NoDestination } from "./storageTypes";

/**
 * Goods lying somewhere that is not storage and ought to be hauled.
 */
export type LooseGoods = {
  entityId: EntityId;
  materialId: string;
  /**
   * Unreserved units.
   */
  quantity: number;
};

/**
 * The materials that count as products to haul: every output of a job type (logs from felling,
 * wheat from harvesting ...) and every crop of a zone type (`cropOutputs`: flax, barley, rye,
 * vegetables of the crop zones, which the shared harvest job yields, DECISIONS D-130). Personal belongings of citizens (food, tools, coins, building
 * supplies of the starting kit) are not outputs, so they are never taken from their owner.
 *
 * @param engine - The engine with the content.
 * @returns Material ids, sorted.
 */
export function haulableMaterialIds(engine: GameEngine): string[] {
  const ids = new Set<string>();
  for (const jobType of engine.content.jobs.all()) {
    for (const output of jobType.outputs) {
      ids.add(output.materialId);
    }
  }
  for (const zoneType of engine.content.zones.all()) {
    for (const output of zoneType.cropOutputs) {
      ids.add(output.materialId);
    }
  }
  return [...ids].sort();
}

function hasHaulTask(engine: GameEngine, entityId: EntityId): boolean {
  return engine.tasks.getQueue(entityId)?.tasks.some((task) => task.type === haulJobId) ?? false;
}

/**
 * The goods the haul poster considers loose (spec 018 loose items, DECISIONS D-18): everything in
 * a `loose_pile`, and units of {@link haulableMaterialIds} that a citizen carries and is not
 * already delivering. Reserved units do not count. Ascending by entity id, then material id.
 *
 * @param engine - The engine.
 * @returns One entry per holder and material.
 */
export function findLooseGoods(engine: GameEngine): LooseGoods[] {
  const reservations = getStorageService(engine).reservations;
  const haulable = new Set(haulableMaterialIds(engine));
  const found: LooseGoods[] = [];
  for (const entity of engine.store.entities()) {
    const pile = isLoosePile(entity);
    const carrier = hasComponent(entity, citizenComponent);
    if (
      (!pile && !carrier) ||
      !hasComponent(entity, inventoryComponent) ||
      !hasComponent(entity, positionComponent) ||
      (carrier && hasHaulTask(engine, entity.id))
    ) {
      continue;
    }
    for (const item of getAllItems(entity)) {
      const quantity = reservations.availableTo(entity.id, item.materialId, null);
      if (quantity >= 1 && (pile || haulable.has(item.materialId))) {
        found.push({ entityId: entity.id, materialId: item.materialId, quantity });
      }
    }
  }
  return found;
}

/**
 * The nearest running (not paused) job board that can be reached from an entity on its map: lowest
 * path cost, ties lowest entity id. System postings (haul, craft) go there at once (D-08).
 *
 * @param engine - The engine.
 * @param source - An entity with a `Position`.
 * @returns The board's entity id, or null when none is reachable.
 */
export function nearestRunningBoard(engine: GameEngine, source: Entity): EntityId | null {
  const position = getComponent(source, positionComponent);
  if (position === undefined) {
    return null;
  }
  const costs = new Map<number, number>();
  for (const reachable of getAiService(engine).pathfinding.reachable(
    position.mapId,
    position.cellIndex,
  )) {
    costs.set(reachable.cell, reachable.cost);
  }
  let best: { id: EntityId; cost: number } | null = null;
  for (const board of listBoards(engine)) {
    const place = getComponent(board, positionComponent);
    const data = getComponent(board, jobBoardComponent);
    const cost = place === undefined ? undefined : costs.get(place.cellIndex);
    if (
      place === undefined ||
      data === undefined ||
      place.mapId !== position.mapId ||
      cost === undefined ||
      isBoardPaused(data)
    ) {
      continue;
    }
    if (best === null || cost < best.cost) {
      best = { id: board.id, cost };
    }
  }
  return best === null ? null : best.id;
}

/**
 * Posts one `haul.deliver` job for goods lying in an entity (the target names the entity's cell,
 * the entity and the material). Systems and scripts use it for output of workstations and other
 * non-storage inventories; the haul poster uses it for loose goods.
 *
 * @param engine - The engine.
 * @param boardId - Board entity id.
 * @param sourceId - Entity whose inventory holds the goods; it needs a `Position`.
 * @param materialId - The material to haul.
 * @param tick - The current tick.
 * @returns A copy of the new open posting.
 */
export function postHaulJob(
  engine: GameEngine,
  boardId: EntityId,
  sourceId: EntityId,
  materialId: string,
  tick: number,
): JobPosting {
  const position = getComponent(engine.store.require(sourceId), positionComponent);
  if (position === undefined) {
    throw new Error(`entity ${sourceId} has no position to haul from`);
  }
  return postJob(
    engine,
    boardId,
    {
      jobTypeId: haulJobId,
      target: {
        mapId: position.mapId,
        cellIndex: position.cellIndex,
        entityId: sourceId,
        materialId,
      },
    },
    tick,
  );
}

function withdrawStaleHauls(engine: GameEngine, tick: number): void {
  const reservations = getStorageService(engine).reservations;
  for (const posting of activePostingsOfType(engine, haulJobId)) {
    if (posting.status !== PostingStatus.Open) {
      continue;
    }
    const source =
      posting.target.entityId === null ? undefined : engine.store.get(posting.target.entityId);
    const materialId = posting.target.materialId;
    const place = source === undefined ? undefined : getComponent(source, positionComponent);
    if (
      source === undefined ||
      materialId === null ||
      reservations.availableTo(source.id, materialId, null) < 1
    ) {
      cancelPosting(engine, posting.id, sourceGoneReason, tick);
    } else if (
      place !== undefined &&
      chooseRoute(engine, {
        materialId,
        quantity: reservations.availableTo(source.id, materialId, null),
        actorId: null,
        mapId: place.mapId,
        fromCell: place.cellIndex,
      }) === null
    ) {
      cancelPosting(engine, posting.id, noDestinationReason, tick);
    }
  }
}

/**
 * The deterministic haul poster (DECISIONS D-18, D-26: system postings go to the nearest running
 * board at once). Every {@link haulPosterIntervalTicks} ticks it:
 * - withdraws open haul postings whose goods are gone or have no destination any more;
 * - for every loose good (see {@link findLooseGoods}) without an active haul posting: when a storage
 *   accepts it, posts `haul.deliver` on the nearest running board of the goods' map; otherwise
 *   emits `storage.no-compatible-destination` once per holder and material (`NoStorageDestination`)
 *   and tries again at the next look;
 * - removes loose piles that have been emptied.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 * @returns The ids of the postings created.
 */
export function postHaulJobs(engine: GameEngine, tick: number): number[] {
  if (!engine.content.jobs.has(haulJobId) || tick % haulPosterIntervalTicks !== 0) {
    return [];
  }
  const service = getStorageService(engine);
  withdrawStaleHauls(engine, tick);
  const active = activePostingsOfType(engine, haulJobId);
  const created: number[] = [];
  const stillStranded = new Set<string>();
  for (const goods of findLooseGoods(engine)) {
    const source = engine.store.require(goods.entityId);
    const place = getComponent(source, positionComponent);
    if (
      place === undefined ||
      active.some(
        (posting) =>
          posting.target.entityId === goods.entityId &&
          posting.target.materialId === goods.materialId,
      )
    ) {
      continue;
    }
    const route = chooseRoute(engine, {
      materialId: goods.materialId,
      quantity: goods.quantity,
      actorId: null,
      mapId: place.mapId,
      fromCell: place.cellIndex,
    });
    if (route === null) {
      stillStranded.add(`${goods.entityId}:${goods.materialId}`);
      if (service.markReported(goods.entityId, goods.materialId)) {
        const payload: NoDestination = {
          entityId: goods.entityId,
          materialId: goods.materialId,
          quantity: goods.quantity,
        };
        engine.bus.emit(noDestinationEvent, payload);
      }
      continue;
    }
    const boardId = nearestRunningBoard(engine, source);
    if (boardId !== null) {
      created.push(postHaulJob(engine, boardId, goods.entityId, goods.materialId, tick).id);
    }
  }
  service.retainReported((entry) => stillStranded.has(`${entry.entityId}:${entry.materialId}`));
  for (const entity of engine.store.entities()) {
    if (
      isLoosePile(entity) &&
      getAllItems(entity).length === 0 &&
      service.reservations.all().every((reservation) => reservation.inventoryOwnerId !== entity.id)
    ) {
      engine.store.requestDelete(entity.id);
    }
  }
  return created;
}

/**
 * Releases `Haul` reservations whose holder no longer has a `haul.deliver` task: a task that
 * ended without reaching its own cleanup (the posting was cancelled under it) must not hold stock
 * hostage. Runs every tick in the storage system.
 *
 * @param engine - The engine.
 * @returns How many reservations were released.
 */
export function releaseOrphanedHaulReservations(engine: GameEngine): number {
  const reservations = getStorageService(engine).reservations;
  let released = 0;
  for (const reservation of reservations.all()) {
    if (reservation.kind === ReservationKind.Haul && !hasHaulTask(engine, reservation.holderId)) {
      reservations.release(reservation.id);
      released += 1;
    }
  }
  return released;
}
