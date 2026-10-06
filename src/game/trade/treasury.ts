import { getComponent, hasComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { governmentFactionId } from "../factions/factionRegistry";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { credit } from "../inventory/inventoryMoney";
import { InventoryError } from "../inventory/InventoryError";
import { getBalance } from "../inventory/inventoryMoney";
import { transfer } from "../inventory/inventoryOperations";
import { canStore } from "../inventory/inventoryQueries";
import type { JobPosting } from "../jobs/jobTypes";
import { toDay } from "../time/GameTime";
import {
  paymentCompletedEvent,
  paymentDeferredEvent,
  rentReceivedEvent,
  treasuryUnavailableEvent,
} from "./tradeTypes";
import type { PaymentEvent, RentReceived } from "./tradeTypes";
import { getTreasuryService } from "./treasuryServiceRegistry";

/**
 * The settlement treasury (DECISIONS D-55): the inventory of the player government faction entity,
 * which holds the coins of the settlement (wages, trade, rent). It is not a storage furniture
 * and no stock query sees it.
 *
 * @param engine - The engine.
 * @returns The government entity with an inventory, or null before a game exists.
 */
export function treasuryEntity(engine: GameEngine): Entity | null {
  const id = governmentFactionId(engine);
  const entity = id === null ? undefined : engine.store.get(id);
  return entity !== undefined && hasComponent(entity, inventoryComponent) ? entity : null;
}

/**
 * Prepares the treasury when a game starts or loads: gives the government entity an inventory when
 * it has none (a save from before trade), and on a new game puts the content constant
 * `startingTreasury` coins into it.
 *
 * @param engine - The engine.
 * @param newGame - True for a new game (the starting coins are added), false after a load.
 */
export function installTreasury(engine: GameEngine, newGame: boolean): void {
  const id = governmentFactionId(engine);
  if (id === null) {
    return;
  }
  const government = engine.store.require(id);
  if (!hasComponent(government, inventoryComponent)) {
    engine.store.addComponent(id, inventoryComponent, { slotCount: 8, queryable: false });
  }
  const start = engine.content.constants.startingTreasury;
  if (newGame && start > 0) {
    credit({ materials: engine.materials, actor: null }, government, start);
  }
}

/**
 * Coins in the treasury.
 *
 * @param engine - The engine.
 * @returns Whole coins; 0 without a treasury.
 */
export function treasuryBalance(engine: GameEngine): number {
  const treasury = treasuryEntity(engine);
  return treasury === null ? 0 : getBalance({ materials: engine.materials, actor: null }, treasury);
}

/**
 * Puts coins into the treasury (all or nothing).
 *
 * @param engine - The engine.
 * @param amount - Positive whole coins.
 * @returns True when the coins were stored.
 */
export function creditTreasury(engine: GameEngine, amount: number): boolean {
  const treasury = treasuryEntity(engine);
  if (treasury === null || amount < 1) {
    return false;
  }
  try {
    credit({ materials: engine.materials, actor: null, bus: engine.bus }, treasury, amount);
    return true;
  } catch (failure) {
    if (failure instanceof InventoryError) {
      return false;
    }
    throw failure;
  }
}

/**
 * Moves coins from the treasury to another entity (all or nothing).
 *
 * @param engine - The engine.
 * @param recipientId - The entity that gets the coins; it needs an inventory with room.
 * @param amount - Positive whole coins.
 * @returns True when the coins moved.
 */
export function payFromTreasury(
  engine: GameEngine,
  recipientId: EntityId,
  amount: number,
): boolean {
  const treasury = treasuryEntity(engine);
  const recipient = engine.store.get(recipientId);
  const coin = engine.materials.currencyId;
  if (
    treasury === null ||
    recipient === undefined ||
    engine.store.isPendingDelete(recipientId) ||
    !hasComponent(recipient, inventoryComponent) ||
    amount < 1 ||
    treasuryBalance(engine) < amount ||
    !canStore(engine.materials, recipient, coin, amount).fits
  ) {
    return false;
  }
  transfer(
    { materials: engine.materials, actor: null, bus: engine.bus },
    treasury,
    recipient,
    coin,
    amount,
  );
  return true;
}

/**
 * Moves coins from an entity into the treasury (all or nothing); used by workers that bring home
 * what a sale earned or what a purchase left over.
 *
 * @param engine - The engine.
 * @param payerId - The entity that gives the coins.
 * @param amount - Positive whole coins.
 * @returns True when the coins moved.
 */
export function depositToTreasury(engine: GameEngine, payerId: EntityId, amount: number): boolean {
  const treasury = treasuryEntity(engine);
  const payer = engine.store.get(payerId);
  const coin = engine.materials.currencyId;
  if (
    treasury === null ||
    payer === undefined ||
    !hasComponent(payer, inventoryComponent) ||
    amount < 1 ||
    getBalance({ materials: engine.materials, actor: null }, payer) < amount ||
    !canStore(engine.materials, treasury, coin, amount).fits
  ) {
    return false;
  }
  transfer(
    { materials: engine.materials, actor: null, bus: engine.bus },
    payer,
    treasury,
    coin,
    amount,
  );
  return true;
}

/**
 * The rent hook of spec 019 FR-003 and 029 FR-013 (task 4.5 calls it): coins from a dwelling's
 * household go straight into the treasury. Emits `treasury.rent.received`.
 *
 * @param engine - The engine.
 * @param dwellingId - The dwelling that paid.
 * @param amount - Whole coins paid.
 * @returns True when the treasury took the coins; false when it is full or missing, in which
 * case the caller keeps the coins and reports the shortfall (`TreasuryUnavailable`).
 */
export function receiveRent(engine: GameEngine, dwellingId: EntityId, amount: number): boolean {
  if (!creditTreasury(engine, amount)) {
    return false;
  }
  const payload: RentReceived = { dwellingId, amount };
  engine.bus.emit(rentReceivedEvent, payload);
  return true;
}

/**
 * The wage payer of the job boards (spec 019 FR-012/013, `JobService.setWagePayer`): the wage
 * goes from the treasury to the worker's inventory. When the treasury holds too few coins or the
 * worker has no room, the wage is queued (`treasury.payment.deferred`) and retried every tick in
 * payment order (`treasury.payment.completed` when it is paid). Wage 0 transfers nothing.
 *
 * @param engine - The engine.
 * @param workerId - The paid entity.
 * @param wage - Whole coins.
 * @param posting - The completed posting; its claim id is the payment id (D-12).
 */
export function payWageFromTreasury(
  engine: GameEngine,
  workerId: EntityId,
  wage: number,
  posting: JobPosting,
): void {
  if (wage < 1) {
    return;
  }
  const paymentId = posting.claimId ?? posting.id;
  const payload: PaymentEvent = { paymentId, workerId, amount: wage };
  if (payFromTreasury(engine, workerId, wage)) {
    engine.bus.emit(paymentCompletedEvent, payload);
    return;
  }
  const service = getTreasuryService(engine);
  if (service.enqueue({ paymentId, workerId, amount: wage, createdTick: engine.time.tickCount })) {
    engine.bus.emit(paymentDeferredEvent, payload);
  }
  if (treasuryEntity(engine) === null && service.markUnavailable(toDay(engine.time.tickCount))) {
    engine.bus.emit(treasuryUnavailableEvent, {});
  }
}

/**
 * Retries the queued wages in payment order (every tick, slot 10). A wage whose worker no longer
 * exists is dropped; a wage that still does not fit stays queued and does not block later ones
 * that fit (a smaller wage may be paid while a larger one waits).
 *
 * @param engine - The engine.
 * @returns The number of wages paid.
 */
export function retryWagePayments(engine: GameEngine): number {
  const service = getTreasuryService(engine);
  let paid = 0;
  for (const payment of service.payments()) {
    const worker = engine.store.get(payment.workerId);
    if (worker === undefined || getComponent(worker, inventoryComponent) === undefined) {
      service.remove(payment.paymentId);
      continue;
    }
    if (payFromTreasury(engine, payment.workerId, payment.amount)) {
      service.remove(payment.paymentId);
      const payload: PaymentEvent = {
        paymentId: payment.paymentId,
        workerId: payment.workerId,
        amount: payment.amount,
      };
      engine.bus.emit(paymentCompletedEvent, payload);
      paid += 1;
    }
  }
  return paid;
}
