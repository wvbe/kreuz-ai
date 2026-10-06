import type { GameEngine } from "../engine/GameEngine";
import { transfer } from "../inventory/inventoryOperations";
import {
  DestinationFullError,
  InventoryError,
  InventoryFullError,
  WeightLimitExceededError,
} from "../inventory/InventoryError";
import { StorageError } from "../storage/StorageError";
import { getStorageService } from "../storage/storageServiceRegistry";
import { ReservationKind } from "../storage/storageTypes";
import { ExecutionFailure } from "./tradeTypes";
import type { Leg, TradeOffer } from "./tradeTypes";

/**
 * Outcome of {@link executeTrade}.
 */
export type ExecutionResult = { ok: true; legs: Leg[] } | { ok: false; reason: ExecutionFailure };

/**
 * The transfers of an offer: the requested goods from the seller to the buyer, the barter goods
 * and the coins from the buyer to the seller.
 *
 * @param engine - The engine (names the currency).
 * @param offer - The offer.
 * @returns The legs in execution order (goods first).
 */
export function legsOf(engine: GameEngine, offer: TradeOffer): Leg[] {
  const legs: Leg[] = offer.requested.map((item) => ({
    fromId: offer.sellerId,
    toId: offer.buyerId,
    materialId: item.materialId,
    quantity: item.quantity,
  }));
  for (const item of offer.offered) {
    legs.push({
      fromId: offer.buyerId,
      toId: offer.sellerId,
      materialId: item.materialId,
      quantity: item.quantity,
    });
  }
  if (offer.coins > 0) {
    legs.push({
      fromId: offer.buyerId,
      toId: offer.sellerId,
      materialId: engine.materials.currencyId,
      quantity: offer.coins,
    });
  }
  return legs;
}

function failureOf(offer: TradeOffer, leg: Leg | null, failure: Error): ExecutionFailure {
  if (
    failure instanceof InventoryFullError ||
    failure instanceof DestinationFullError ||
    failure instanceof WeightLimitExceededError
  ) {
    return leg !== null && leg.toId === offer.buyerId
      ? ExecutionFailure.BuyerInventoryFull
      : ExecutionFailure.SellerInventoryFull;
  }
  if (failure instanceof InventoryError || failure instanceof StorageError) {
    return ExecutionFailure.StockChanged;
  }
  throw failure;
}

/**
 * Executes an accepted offer atomically (spec 019 FR-009, SC-002): every leg is reserved first
 * (`Payment` reservations held by the buyer, so nobody else can claim the same goods or coins in
 * between), then committed one after the other; when any leg fails, the legs already done are
 * moved back and the remaining reservations are released, so both parties end up exactly as they
 * were. Nothing is emitted here; the caller reports the result.
 *
 * @param engine - The engine.
 * @param offer - The accepted offer.
 * @returns The legs done, or the reason nothing moved.
 */
export function executeTrade(engine: GameEngine, offer: TradeOffer): ExecutionResult {
  if (!engine.store.has(offer.buyerId)) {
    return { ok: false, reason: ExecutionFailure.BuyerDeleted };
  }
  if (!engine.store.has(offer.sellerId)) {
    return { ok: false, reason: ExecutionFailure.SellerDeleted };
  }
  const reservations = getStorageService(engine).reservations;
  const legs = legsOf(engine, offer);
  const held: number[] = [];
  const done: Leg[] = [];
  let current: Leg | null = null;
  let failure: Error | null = null;
  try {
    for (const leg of legs) {
      current = leg;
      held.push(
        reservations.reserve({
          kind: ReservationKind.Payment,
          holderId: offer.buyerId,
          inventoryOwnerId: leg.fromId,
          materialId: leg.materialId,
          quantity: leg.quantity,
        }).id,
      );
    }
    for (const [index, leg] of legs.entries()) {
      current = leg;
      reservations.commit(held[index] as number, engine.store.require(leg.toId));
      done.push(leg);
    }
  } catch (caught) {
    if (!(caught instanceof Error)) {
      throw caught;
    }
    failure = caught;
  }
  if (failure === null) {
    return { ok: true, legs: done };
  }
  const context = { materials: engine.materials, actor: null, bus: engine.bus };
  for (const leg of done.reverse()) {
    transfer(
      context,
      engine.store.require(leg.toId),
      engine.store.require(leg.fromId),
      leg.materialId,
      leg.quantity,
    );
  }
  for (const id of held) {
    reservations.release(id);
  }
  return { ok: false, reason: failureOf(offer, current, failure) };
}
