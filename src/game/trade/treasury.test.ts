import { describe, expect, it } from "vitest";
import { getComponent, hasComponent } from "../ecs/Entity";
import { governmentFactionId } from "../factions/factionRegistry";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { debit, getBalance } from "../inventory/inventoryMoney";
import { transfer } from "../inventory/inventoryOperations";
import { payWage } from "../jobs/payWage";
import { createTradeWorld, fullInventory } from "./testTradeWorld";
import type { TradeTestWorld } from "./testTradeWorld";
import {
  creditTreasury,
  depositToTreasury,
  installTreasury,
  payFromTreasury,
  payWageFromTreasury,
  receiveRent,
  retryWagePayments,
  treasuryBalance,
  treasuryEntity,
} from "./treasury";
import { getTreasuryService } from "./treasuryServiceRegistry";
import {
  paymentCompletedEvent,
  paymentDeferredEvent,
  rentReceivedEvent,
  treasuryUnavailableEvent,
} from "./tradeTypes";

function drain(world: TradeTestWorld, keep: number): void {
  const treasury = treasuryEntity(world.engine);
  if (treasury !== null) {
    debit(
      { materials: world.engine.materials, actor: null },
      treasury,
      treasuryBalance(world.engine) - keep,
    );
  }
}

// @covers 019:FR-003 019:FR-012 019:FR-013 019:FR-015 019:SC-003 019:SC-005
describe("installTreasury and treasuryEntity", () => {
  it("funds the treasury of a new game with startingTreasury coins", () => {
    const world = createTradeWorld();
    expect(treasuryEntity(world.engine)?.id).toBe(governmentFactionId(world.engine));
    expect(treasuryBalance(world.engine)).toBe(world.engine.content.constants.startingTreasury);
  });

  it("gives a government entity without inventory (an old save) one and adds nothing", () => {
    const world = createTradeWorld();
    const id = governmentFactionId(world.engine) ?? 0;
    world.engine.store.removeComponent(id, inventoryComponent);
    expect(treasuryEntity(world.engine)).toBeNull();
    expect(treasuryBalance(world.engine)).toBe(0);
    installTreasury(world.engine, false);
    expect(hasComponent(world.engine.store.require(id), inventoryComponent)).toBe(true);
    expect(treasuryBalance(world.engine)).toBe(0);
    installTreasury(world.engine, true);
    expect(treasuryBalance(world.engine)).toBe(world.engine.content.constants.startingTreasury);
  });
});

describe("creditTreasury, payFromTreasury, depositToTreasury", () => {
  it("moves whole coins in and out, all or nothing", () => {
    const world = createTradeWorld();
    const worker = world.settler(4);
    const start = treasuryBalance(world.engine);
    expect(payFromTreasury(world.engine, worker.id, 15)).toBe(true);
    expect(world.coins(worker.id)).toBe(15);
    expect(treasuryBalance(world.engine)).toBe(start - 15);
    expect(payFromTreasury(world.engine, worker.id, start)).toBe(false);
    expect(payFromTreasury(world.engine, 9999, 1)).toBe(false);
    expect(payFromTreasury(world.engine, worker.id, 0)).toBe(false);
    expect(depositToTreasury(world.engine, worker.id, 10)).toBe(true);
    expect(depositToTreasury(world.engine, worker.id, 10)).toBe(false);
    expect(creditTreasury(world.engine, 7)).toBe(true);
    expect(creditTreasury(world.engine, 0)).toBe(false);
    expect(treasuryBalance(world.engine)).toBe(start - 15 + 10 + 7);
  });

  it("refuses to pay an entity that has no room for the coins", () => {
    const world = createTradeWorld();
    const worker = world.settler(4);
    fullInventory(worker);
    expect(payFromTreasury(world.engine, worker.id, 5)).toBe(false);
  });
});

describe("receiveRent (the hook of task 4.5)", () => {
  it("puts the rent into the treasury and queues treasury.rent.received", () => {
    const world = createTradeWorld();
    const seen = world.record(rentReceivedEvent);
    const start = treasuryBalance(world.engine);
    expect(receiveRent(world.engine, 77, 12)).toBe(true);
    world.engine.bus.processQueue();
    expect(treasuryBalance(world.engine)).toBe(start + 12);
    expect(seen.at(-1)).toEqual({ dwellingId: 77, amount: 12 });
    expect(receiveRent(world.engine, 77, 0)).toBe(false);
  });
});

describe("payWageFromTreasury (spec 019 US6)", () => {
  it("pays wage 15 from a 100 coin treasury: worker +15, treasury 85, nothing minted", () => {
    const world = createTradeWorld();
    drain(world, 100);
    const completed = world.record(paymentCompletedEvent);
    const worker = world.settler(4);
    const posting = world.postFell(15, { wage: 15 });
    expect(payWage(world.engine, worker.id, posting)).toBe(true);
    world.engine.bus.processQueue();
    expect(world.coins(worker.id)).toBe(15);
    expect(treasuryBalance(world.engine)).toBe(85);
    expect(completed).toHaveLength(1);
    expect(world.engine.warnings).toEqual([]);
  });

  it("transfers nothing for wage 0", () => {
    const world = createTradeWorld();
    const worker = world.settler(4);
    payWageFromTreasury(world.engine, worker.id, 0, world.postFell(15));
    expect(world.coins(worker.id)).toBe(0);
    expect(getTreasuryService(world.engine).payments()).toEqual([]);
  });

  it("defers a wage the treasury cannot pay and pays it later, in order", () => {
    const world = createTradeWorld();
    drain(world, 5);
    const deferred = world.record(paymentDeferredEvent);
    const completed = world.record(paymentCompletedEvent);
    const worker = world.settler(4);
    const other = world.settler(5);
    const first = world.postFell(15, { wage: 8 });
    const second = world.postFell(16, { wage: 3 });
    payWageFromTreasury(world.engine, worker.id, 8, { ...first, claimId: 11 });
    payWageFromTreasury(world.engine, other.id, 3, { ...second, claimId: 12 });
    world.engine.bus.processQueue();
    expect(world.coins(worker.id)).toBe(0);
    expect(world.coins(other.id)).toBe(3);
    expect(deferred).toHaveLength(1);
    expect(getTreasuryService(world.engine).payments()).toMatchObject([
      { paymentId: 11, workerId: worker.id, amount: 8 },
    ]);
    expect(retryWagePayments(world.engine)).toBe(0);
    creditTreasury(world.engine, 6);
    expect(retryWagePayments(world.engine)).toBe(1);
    world.engine.bus.processQueue();
    expect(world.coins(worker.id)).toBe(8);
    expect(getTreasuryService(world.engine).payments()).toEqual([]);
    expect(completed.map((event) => (event as { paymentId: number }).paymentId)).toEqual([12, 11]);
  });

  it("accumulates the wages of several jobs and defers when the worker has no room", () => {
    const world = createTradeWorld();
    const worker = world.settler(4);
    fullInventory(worker);
    const posting = world.postFell(15, { wage: 2 });
    payWageFromTreasury(world.engine, worker.id, 2, { ...posting, claimId: 5 });
    payWageFromTreasury(world.engine, worker.id, 2, { ...posting, claimId: 6 });
    expect(getTreasuryService(world.engine).payments()).toHaveLength(2);
    const inventory = getComponent(worker, inventoryComponent);
    if (inventory !== undefined) {
      inventory.slotCount += 1;
    }
    retryWagePayments(world.engine);
    expect(world.coins(worker.id)).toBe(4);
  });

  it("drops the wage of a worker that no longer exists", () => {
    const world = createTradeWorld();
    drain(world, 0);
    const worker = world.settler(4);
    payWageFromTreasury(world.engine, worker.id, 2, { ...world.postFell(15), claimId: 9 });
    expect(getTreasuryService(world.engine).payments()).toHaveLength(1);
    world.engine.store.requestDelete(worker.id);
    world.engine.store.flushDeletions();
    creditTreasury(world.engine, 10);
    expect(retryWagePayments(world.engine)).toBe(0);
    expect(getTreasuryService(world.engine).payments()).toEqual([]);
  });

  it("reports a missing treasury once per day", () => {
    const world = createTradeWorld();
    const seen = world.record(treasuryUnavailableEvent);
    world.engine.store.removeComponent(governmentFactionId(world.engine) ?? 0, inventoryComponent);
    const worker = world.settler(4);
    const posting = world.postFell(15, { wage: 2 });
    payWageFromTreasury(world.engine, worker.id, 2, { ...posting, claimId: 1 });
    payWageFromTreasury(world.engine, worker.id, 2, { ...posting, claimId: 2 });
    world.engine.bus.processQueue();
    expect(seen).toHaveLength(1);
    expect(getTreasuryService(world.engine).payments()).toHaveLength(2);
  });
});

// @covers 019:FR-001 019:FR-002 019:SC-001
describe("currency is an ordinary stackable material", () => {
  it("has a stack limit of 1000 and moves between any two inventories with the standard API", () => {
    const world = createTradeWorld();
    const coin = world.engine.materials.require(world.engine.materials.currencyId);
    expect(coin.stackLimit).toBe(1000);
    const treasury = treasuryEntity(world.engine);
    const settler = world.settler(11);
    const context = { materials: world.engine.materials, actor: null };
    const before = getBalance(context, settler);
    transfer(context, treasury as NonNullable<typeof treasury>, settler, coin.id, 40);
    expect(getBalance(context, settler)).toBe(before + 40);
    expect(treasuryBalance(world.engine)).toBe(
      world.engine.content.constants.startingTreasury - 40,
    );
  });
});
