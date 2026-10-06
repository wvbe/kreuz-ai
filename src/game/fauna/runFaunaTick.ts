import { maxMeterMilli } from "../ai/aiTypes";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { storeUpTo } from "../inventory/inventoryOperations";
import { positionComponent } from "../map/positionComponent";
import { animalComponent } from "./animalComponent";
import { animalContentOf } from "./animalSenses";
import { animalEatPerTick, animalHungerPerTick, animalProducedEvent } from "./faunaTypes";
import type { AnimalProduced } from "./faunaTypes";

/**
 * One tick of one animal: hunger grows by `animalHungerPerTick` (and falls by `animalEatPerTick`
 * on a diet terrain, never below 0), and the periodic product is put into the animal's own
 * inventory as far as it fits when it is due (`animal.product.ready`). Without room the yield of
 * that period is lost.
 *
 * @param engine - The engine.
 * @param entity - An animal entity.
 * @param tick - The tick being processed.
 */
export function tickAnimal(engine: GameEngine, entity: Entity, tick: number): void {
  const animal = getComponent(entity, animalComponent);
  const content = animalContentOf(engine, entity);
  if (animal === undefined || content === undefined) {
    return;
  }
  const position = getComponent(entity, positionComponent);
  const map = position === undefined ? undefined : engine.maps.get(position.mapId);
  const eating =
    position !== undefined &&
    map !== undefined &&
    content.dietTerrainIds.includes(map.terrainAt(position.cellIndex));
  const change = animalHungerPerTick - (eating ? animalEatPerTick : 0);
  animal.hungerMilli = Math.min(maxMeterMilli, Math.max(0, animal.hungerMilli + change));
  if (content.productIntervalTicks === 0 || content.products.length === 0) {
    return;
  }
  if (animal.nextProductTick === 0) {
    animal.nextProductTick = tick + content.productIntervalTicks;
    return;
  }
  if (tick < animal.nextProductTick) {
    return;
  }
  animal.nextProductTick = tick + content.productIntervalTicks;
  for (const product of content.products) {
    storeUpTo(
      { materials: engine.materials, actor: null },
      entity,
      product.materialId,
      product.quantity,
    );
  }
  const payload: AnimalProduced = { entityId: entity.id, prototypeId: animal.prototypeId };
  engine.bus.emit(animalProducedEvent, payload);
}

/**
 * Slot 4: runs {@link tickAnimal} for every animal in ascending id.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 */
export function runFaunaTick(engine: GameEngine, tick: number): void {
  for (const entity of engine.store.entities()) {
    if (getComponent(entity, animalComponent) !== undefined) {
      tickAnimal(engine, entity, tick);
    }
  }
}
