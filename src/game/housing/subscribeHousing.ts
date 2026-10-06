import { z } from "zod";
import { needItemConsumedEvent } from "../ai/aiTypes";
import { getComponent } from "../ecs/Entity";
import type { EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { citizenComponent } from "../factions/citizenComponent";
import { toDay } from "../time/GameTime";
import {
  zoneDeletedEvent,
  zoneMergedEvent,
  zoneRequirementsMetEvent,
  zoneSplitEvent,
} from "../zones/zoneTypes";
import { dwellingComponent } from "./dwellingComponent";
import { dwellingCapacity, dwellingOf } from "./dwellingZones";
import { levelRank } from "./dwellingLevels";
import { evictionOrder, evictResident } from "./enforceCapacity";
import { ensureDwelling } from "./ensureDwellings";
import { residentsOf } from "./household";
import { getHousingService } from "./housingServiceRegistry";
import { EvictionReason } from "./housingTypes";

const idSchema = z.number().int().min(1);
const metSchema = z.object({ zoneId: idSchema });
const splitSchema = z.object({ zoneId: idSchema, newZoneIds: z.array(idSchema) });
const mergedSchema = z.object({ survivorId: idSchema, absorbedId: idSchema });
const deletedSchema = z.object({ zoneId: idSchema });
const consumedSchema = z.object({ entityId: idSchema, materialId: z.string() });

/**
 * Category of the materials whose consumption counts for food variety (spec 029 FR-018).
 */
export const foodCategory = "food";

function resetStreaks(engine: GameEngine, dwellingId: EntityId): void {
  const record = dwellingOf(engine, dwellingId);
  if (record !== null) {
    record.dwelling.upgradeStreak = 0;
    record.dwelling.downgradeStreak = 0;
  }
}

function onSplit(engine: GameEngine, zoneId: EntityId, newZoneIds: readonly EntityId[]): void {
  const parent = dwellingOf(engine, zoneId);
  if (parent === null) {
    return;
  }
  for (const id of newZoneIds) {
    if (engine.store.get(id) !== undefined && !engine.store.isPendingDelete(id)) {
      engine.store.addComponent(id, dwellingComponent, { level: parent.dwelling.level });
    }
    resetStreaks(engine, id);
  }
  resetStreaks(engine, zoneId);
  const excess = residentsOf(engine, zoneId).length - dwellingCapacity(engine, parent);
  if (excess > 0) {
    for (const entity of evictionOrder(residentsOf(engine, zoneId)).slice(0, excess)) {
      evictResident(engine, entity.id, zoneId, EvictionReason.DwellingChanged);
    }
  }
}

function onMerged(engine: GameEngine, survivorId: EntityId, absorbedId: EntityId): void {
  const service = getHousingService(engine);
  const survivor = dwellingOf(engine, survivorId);
  const absorbedLevel =
    service.retiredLevel(absorbedId) ?? dwellingOf(engine, absorbedId)?.dwelling.level ?? null;
  service.unretire(absorbedId);
  const homeless = residentsOf(engine, absorbedId);
  if (survivor === null) {
    for (const entity of homeless) {
      evictResident(engine, entity.id, absorbedId, EvictionReason.DwellingChanged);
    }
    return;
  }
  if (absorbedLevel !== null && levelRank(absorbedLevel) < levelRank(survivor.dwelling.level)) {
    survivor.dwelling.level = absorbedLevel;
  }
  resetStreaks(engine, survivorId);
  const everyone = [...residentsOf(engine, survivorId), ...homeless].sort((left, right) => {
    const leftTick = getComponent(left, citizenComponent)?.homeAssignedTick ?? 0;
    const rightTick = getComponent(right, citizenComponent)?.homeAssignedTick ?? 0;
    return leftTick === rightTick ? left.id - right.id : leftTick - rightTick;
  });
  const capacity = dwellingCapacity(engine, survivor);
  everyone.forEach((entity, index) => {
    const citizen = getComponent(entity, citizenComponent);
    if (citizen === undefined) {
      return;
    }
    if (index < capacity) {
      citizen.homeDwellingId = survivorId;
    } else {
      evictResident(
        engine,
        entity.id,
        citizen.homeDwellingId ?? survivorId,
        EvictionReason.DwellingChanged,
      );
    }
  });
}

function onDeleted(engine: GameEngine, zoneId: EntityId): void {
  const service = getHousingService(engine);
  service.forget(zoneId);
  for (const entity of residentsOf(engine, zoneId)) {
    evictResident(engine, entity.id, zoneId, EvictionReason.DwellingRemoved);
  }
  service.unretire(zoneId);
}

/**
 * Subscribes housing to the bus (spec 029 FR-018 and the edge cases):
 * - `zone.requirements.met` gives a `dwelling` zone its `Dwelling` state (a Hovel);
 * - `need.item.consumed` of a food-category material records `materialId -> game day` in the
 *   eater's household (DECISIONS D-28), for citizens with a home only;
 * - `zone.split`: the zone that keeps the id and the new parts keep the level, both streaks reset,
 *   residents beyond the remaining capacity are evicted with `DwellingChanged`;
 * - `zone.merged`: the survivor takes the lower level and resets its streaks; residents of both
 *   zones are kept by ascending assignment tick up to capacity, the rest evicted with
 *   `DwellingChanged`;
 * - `zone.deleted`: every resident is evicted with `DwellingRemoved`; goods stay in the furniture.
 *
 * A hook before entity removal remembers the level of a removed dwelling, so that the merge can
 * still read the absorbed zone's level after its entity is gone. The subscriptions belong to the
 * engine; nothing is saved.
 *
 * @param engine - The engine.
 */
export function subscribeHousing(engine: GameEngine): void {
  engine.store.addBeforeDeleteHook((entity) => {
    const data = getComponent(entity, dwellingComponent);
    if (data !== undefined) {
      getHousingService(engine).retire(entity.id, data.level);
    }
    return null;
  });
  engine.bus.subscribe(zoneRequirementsMetEvent, (payload) => {
    const parsed = metSchema.safeParse(payload);
    if (parsed.success) {
      ensureDwelling(engine, parsed.data.zoneId);
    }
  });
  engine.bus.subscribe(needItemConsumedEvent, (payload) => {
    const parsed = consumedSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }
    const entity = engine.store.get(parsed.data.entityId);
    const home =
      entity === undefined ? null : getComponent(entity, citizenComponent)?.homeDwellingId;
    const record = home === null || home === undefined ? null : dwellingOf(engine, home);
    if (
      record !== null &&
      engine.materials.has(parsed.data.materialId) &&
      engine.materials.require(parsed.data.materialId).categories.includes(foodCategory)
    ) {
      record.dwelling.foodRecord[parsed.data.materialId] = toDay(engine.time.tickCount);
    }
  });
  engine.bus.subscribe(zoneSplitEvent, (payload) => {
    const parsed = splitSchema.safeParse(payload);
    if (parsed.success) {
      onSplit(engine, parsed.data.zoneId, parsed.data.newZoneIds);
    }
  });
  engine.bus.subscribe(zoneMergedEvent, (payload) => {
    const parsed = mergedSchema.safeParse(payload);
    if (parsed.success) {
      onMerged(engine, parsed.data.survivorId, parsed.data.absorbedId);
    }
  });
  engine.bus.subscribe(zoneDeletedEvent, (payload) => {
    const parsed = deletedSchema.safeParse(payload);
    if (parsed.success) {
      onDeleted(engine, parsed.data.zoneId);
    }
  });
}
