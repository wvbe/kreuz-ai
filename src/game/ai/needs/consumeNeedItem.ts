import { hasComponent } from "../../ecs/Entity";
import type { Entity } from "../../ecs/Entity";
import { inventoryComponent } from "../../inventory/inventoryComponent";
import type { GameEngine } from "../../engine/GameEngine";
import { retrieve } from "../../inventory/inventoryOperations";
import { getTotal } from "../../inventory/inventoryQueries";
import { getAiService } from "../aiServiceRegistry";
import { needItemConsumedEvent } from "../aiTypes";
import type { NeedItemConsumed } from "../aiTypes";
import { addMoodInfluenceTo } from "../mood/runMood";
import { adjustNeed } from "./needAccess";
import { satisfactionAmountMilli } from "./needMath";

/**
 * How long (ticks) the good feeling of a meal or a drink lasts.
 */
export const consumeMoodTicks = 72;

/**
 * Mood boost of consuming an item for a need, milli-percent.
 */
export const consumeMoodMilli = 3000;

/**
 * Consumes one item for a need (spec 013 FR-002/023): takes it out of the holder's general
 * storage, raises the need by `amountMilli` combined with the consumer's trait satisfaction bonus
 * (clamped at 100 percent), adds a short positive mood influence and emits `need.item.consumed`.
 * The caller has checked that the holder has the item; the call itself fails (nothing changes)
 * when the holder has none the consumer may take (stock reserved by others, DECISIONS D-09).
 *
 * @param engine - The engine.
 * @param consumer - The entity whose need is satisfied (needs a `Needs` component).
 * @param holder - The entity whose inventory the item leaves (the consumer for its own items).
 * @param needId - The satisfied need.
 * @param materialId - The consumed material.
 * @param amountMilli - Authored satisfaction per item.
 * @param tick - Current tick (for the mood influence).
 * @returns False when the holder does not hold the item (nothing changes).
 */
export function consumeNeedItem(
  engine: GameEngine,
  consumer: Entity,
  holder: Entity,
  needId: string,
  materialId: string,
  amountMilli: number,
  tick: number,
): boolean {
  if (
    !hasComponent(holder, inventoryComponent) ||
    getAiService(engine).itemsAvailable(
      engine,
      holder,
      consumer,
      materialId,
      getTotal(holder, materialId),
    ) < 1
  ) {
    return false;
  }
  retrieve(
    { materials: engine.materials, actor: consumer.id, bus: engine.bus },
    holder,
    materialId,
    1,
  );
  adjustNeed(
    consumer,
    needId,
    satisfactionAmountMilli(engine.content, consumer, needId, amountMilli),
  );
  addMoodInfluenceTo(
    consumer,
    `consumed_${needId}`,
    consumeMoodMilli,
    tick + consumeMoodTicks,
    tick,
  );
  const payload: NeedItemConsumed = {
    entityId: consumer.id,
    needId,
    materialId,
    quantity: 1,
  };
  engine.bus.emit(needItemConsumedEvent, payload);
  return true;
}
