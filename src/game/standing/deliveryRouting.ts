import { getAiService } from "../ai/aiServiceRegistry";
import { applyBoardUpdate } from "../crier/boardUpdates";
import { getCrierService } from "../crier/crierServiceRegistry";
import { DeliveryMethod } from "../crier/crierTypes";
import type { DeliveryRoute } from "../crier/crierTypes";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { positionComponent } from "../map/positionComponent";
import { PathResultKind } from "../pathfinding/pathTypes";
import { furnitureComponent } from "../storage/furnitureComponent";
import { zoneComponent } from "../zones/zoneComponent";
import { activeZonesOfType } from "../zones/zoneQueries";
import { hopDistance } from "./hopDistance";
import {
  bellRangEvent,
  bellTowerZoneTypeId,
  churchBellFurnitureId,
  noticePostFurnitureId,
} from "./standingTypes";
import type { BellRang } from "./standingTypes";

function furnitureOf(engine: GameEngine, furnitureId: string): Entity[] {
  return engine.store
    .entities()
    .filter(
      (entity) =>
        getComponent(entity, furnitureComponent)?.furnitureId === furnitureId &&
        getComponent(entity, positionComponent) !== undefined &&
        !engine.store.isPendingDelete(entity.id),
    );
}

/**
 * The Notice Posts (furniture `notice_post` on a map), ascending by id.
 *
 * @param engine - The engine.
 * @returns Live entities.
 */
export function listNoticePosts(engine: GameEngine): Entity[] {
  return furnitureOf(engine, noticePostFurnitureId);
}

/**
 * The Notice Post that serves a board (spec 026 FR-021): the nearest post by hop distance on the
 * map adjacency graph within `noticePostRadius`, ties by the lowest entity id. A post that has no
 * walkable connection to the board is passed over (D-19: the crier then goes to the board
 * itself).
 *
 * @param engine - The engine.
 * @param boardId - The board entity.
 * @returns The post's entity id, or null when no post serves the board.
 */
export function servingPost(engine: GameEngine, boardId: EntityId): EntityId | null {
  const board = engine.store.get(boardId);
  const place = board === undefined ? undefined : getComponent(board, positionComponent);
  if (place === undefined) {
    return null;
  }
  const radius = engine.content.constants.noticePostRadius;
  const map = engine.maps.require(place.mapId);
  let best: { id: EntityId; hops: number } | null = null;
  for (const post of listNoticePosts(engine)) {
    const postPlace = getComponent(post, positionComponent);
    if (postPlace === undefined || postPlace.mapId !== place.mapId) {
      continue;
    }
    const hops = hopDistance(map, postPlace.cellIndex, place.cellIndex, radius);
    if (hops === null || (best !== null && hops >= best.hops)) {
      continue;
    }
    const way = getAiService(engine).pathfinding.findPath(
      place.mapId,
      postPlace.cellIndex,
      place.cellIndex,
    );
    if (way.kind !== PathResultKind.NoPath) {
      best = { id: post.id, hops };
    }
  }
  return best === null ? null : best.id;
}

/**
 * The crier route of a board (installed with `CrierService.setRouter`): to the Notice Post that
 * serves it, or null for the board itself.
 *
 * @param engine - The engine.
 * @param boardId - The board entity.
 * @returns The route, or null.
 */
export function noticePostRoute(engine: GameEngine, boardId: EntityId): DeliveryRoute | null {
  const postId = servingPost(engine, boardId);
  return postId === null ? null : { destinationId: postId, via: DeliveryMethod.NoticePost };
}

/**
 * One Bell Tower that can ring: the active `bell_tower` zone and its church bell.
 */
export type BellTower = {
  zoneId: EntityId;
  bellId: EntityId;
  mapId: number;
  cellIndex: number;
};

/**
 * The Bell Towers that ring (spec 026 FR-022): active zones of the type `bell_tower` that still
 * hold a church bell on one of their tiles (the lowest bell id when there are several), ascending
 * by zone id. A tower whose bell was removed is inactive and does not ring.
 *
 * @param engine - The engine.
 * @returns The towers.
 */
export function activeBellTowers(engine: GameEngine): BellTower[] {
  const bells = furnitureOf(engine, churchBellFurnitureId);
  const towers: BellTower[] = [];
  for (const zoneId of activeZonesOfType(engine, bellTowerZoneTypeId)) {
    const zone = getComponent(engine.store.require(zoneId), zoneComponent);
    const bell = bells.find((candidate) => {
      const place = getComponent(candidate, positionComponent);
      return (
        zone !== undefined &&
        place !== undefined &&
        place.mapId === zone.mapId &&
        zone.tiles.includes(place.cellIndex)
      );
    });
    const place = bell === undefined ? undefined : getComponent(bell, positionComponent);
    if (bell !== undefined && place !== undefined) {
      towers.push({ zoneId, bellId: bell.id, mapId: place.mapId, cellIndex: place.cellIndex });
    }
  }
  return towers;
}

/**
 * Rings the bells (spec 026 FR-022/023): when `tickOfDay` is one of `bellRingTicksOfDay`, every
 * Bell Tower queues `bell-tower.rang` and every pending board update (waiting or on a crier's
 * load) whose board is within `bellRadius` hops of the bell is applied at once with
 * `via: BellTower`. The update leaves the crier's load, so a crier left with nothing stops
 * walking at its next recovery.
 *
 * @param engine - The engine.
 * @param tickOfDay - The tick of the day.
 * @returns How many updates the bells applied.
 */
export function ringBells(engine: GameEngine, tickOfDay: number): number {
  if (!engine.content.constants.bellRingTicksOfDay.includes(tickOfDay)) {
    return 0;
  }
  const radius = engine.content.constants.bellRadius;
  let applied = 0;
  for (const tower of activeBellTowers(engine)) {
    const payload: BellRang = { zoneId: tower.zoneId, tickOfDay };
    engine.bus.emit(bellRangEvent, payload);
    const map = engine.maps.require(tower.mapId);
    for (const update of getCrierService(engine).updates()) {
      const board = engine.store.get(update.boardId);
      const place = board === undefined ? undefined : getComponent(board, positionComponent);
      if (
        place !== undefined &&
        place.mapId === tower.mapId &&
        hopDistance(map, tower.cellIndex, place.cellIndex, radius) !== null &&
        applyBoardUpdate(engine, update.updateId, DeliveryMethod.BellTower)
      ) {
        applied += 1;
      }
    }
  }
  return applied;
}
