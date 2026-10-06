import { z } from "zod";
import { defineCommand } from "../api/defineCommand";
import { defineQuery } from "../api/defineQuery";
import { aiSystemId } from "../ai/aiTypes";
import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { InitMode } from "../engine/engineSystemTypes";
import { TickSlot } from "../engine/TickPipeline";
import { factionsSystemId } from "../factions/factionTypes";
import { getJobService } from "../jobs/jobServiceRegistry";
import { jobsSystemId } from "../jobs/jobTypes";
import { getStorageService } from "../storage/storageServiceRegistry";
import { storageSystemId } from "../storage/storageTypes";
import { standingChangedEvent } from "../factions/factionTypes";
import { merchantComponent } from "./merchantComponent";
import { topUpRefinedStash } from "./refinedLedger";
import { registerBuyJob } from "./tradeBuyJob";
import {
  acceptCounter,
  cancelHostileOffers,
  cancelOffer,
  cancelOffersOf,
  processOffers,
  proposeOffer,
} from "./tradeOffers";
import { cancelTradeOrder, createTradeOrder, postTradeJobs } from "./tradeOrders";
import { registerSellJob } from "./tradeSellJob";
import { TradeService } from "./TradeService";
import { bindTradeService, getTradeService } from "./tradeServiceRegistry";
import { TradeError, TradeErrorKind } from "./TradeError";
import {
  OrderDirection,
  cancelledByPlayerReason,
  orderRefusedEvent,
  tradeSystemId,
  traderLeftEvent,
  traderVisitSystemId,
  treasurySystemId,
} from "./tradeTypes";
import type { OrderRefused, TraderVisitEvent } from "./tradeTypes";
import { traderComponent } from "./traderComponent";
import { createTraderVisitTask } from "./createTraderVisitTask";
import { initTraderVisits, listTraders, runTraderVisits } from "./traderVisits";
import {
  buildLedgerViews,
  buildOfferViews,
  buildOrderViews,
  buildQuoteView,
  buildTradersView,
  buildTreasuryView,
} from "./tradeViews";
import { installTreasury, payWageFromTreasury, retryWagePayments } from "./treasury";
import { TreasuryService } from "./TreasuryService";
import { bindTreasuryService } from "./treasuryServiceRegistry";

const registered = new WeakSet<GameEngine>();

const idSchema = z.number().int().min(1);
const itemSchema = z
  .object({ materialId: z.string().min(1), quantity: z.number().int().min(1) })
  .strict();

const proposeSchema = z
  .object({
    buyerId: idSchema,
    sellerId: idSchema,
    requested: z.array(itemSchema).min(1),
    offeredItems: z.array(itemSchema).default([]),
    offeredCoins: z.number().int().min(0).default(0),
  })
  .strict();

const orderSchema = z
  .object({ traderId: idSchema, materialId: z.string().min(1), quantity: idSchema })
  .strict();

const noArgs = z.object({}).strict();

function placeOrder(
  engine: GameEngine,
  direction: OrderDirection,
  payload: { traderId: number; materialId: string; quantity: number },
): { orderId: number } {
  try {
    return {
      orderId: createTradeOrder(
        engine,
        payload.traderId,
        direction,
        payload.materialId,
        payload.quantity,
        engine.time.tickCount,
      ).orderId,
    };
  } catch (failure) {
    if (failure instanceof TradeError) {
      const refused: OrderRefused = {
        direction,
        ...payload,
        kind: failure.kind,
        message: failure.message,
      };
      engine.bus.emit(orderRefusedEvent, refused);
    }
    throw failure;
  }
}

function requireEntity(engine: GameEngine, entityId: number): void {
  if (!engine.store.has(entityId)) {
    throw new TradeError(TradeErrorKind.UnknownEntity, `entity ${entityId} does not exist`);
  }
}

function ensureMerchant(engine: GameEngine, entityId: number): void {
  requireEntity(engine, entityId);
  if (getComponent(engine.store.require(entityId), merchantComponent) === undefined) {
    engine.store.addComponent(entityId, merchantComponent);
  }
}

/**
 * Registers trade and the treasury with an engine (once per engine; the engine does it for
 * itself, so every game has it, after gathering). It adds:
 * - the components `Merchant` and `Trader`, the task `trader.visit` and the executors of the job
 *   types `trade.sell` and `trade.buy`;
 * - the wage payer of the job boards (`JobService.setWagePayer`): wages come from the treasury,
 *   the inventory of the government faction entity, and wait when it is empty (D-55);
 * - the save sections `systems.treasury` (queued wages) and `systems.trade` (offers, orders, the
 *   refined-credit ledger, visit schedule);
 * - the slot-10 systems `treasury` (retry queued wages) and `trade` (offers in ascending id,
 *   order jobs, refined stash top-up), the slot-11 system `trade.visits` (caravans arrive and
 *   leave), a before-delete hook (a leaving trader queues `trader.left`, offers of a deleted
 *   entity are cancelled, reservations released) and a reaction to
 *   `diplomacy.standing.changed` (offers with a hostile trader are cancelled);
 * - the commands `SetSellsItems`, `SetPriceMultiplier`, `ProposeTrade`, `WithdrawTradeOffer`,
 *   `AcceptTradeCounter`, `TradeSell`, `TradeBuy` and `CancelTradeOrder`;
 * - the queries `traders`, `trade-offers`, `trade-orders`, `trade-ledger`, `treasury` and
 *   `trade-quote`.
 *
 * @param engine - The engine to extend; call before the first `newGame` / `loadGame`, after
 *   `registerGathering`.
 * @returns The engine's trade service.
 */
export function registerTrade(engine: GameEngine): TradeService {
  if (registered.has(engine)) {
    return getTradeService(engine);
  }
  registered.add(engine);
  const trade = new TradeService();
  const treasury = new TreasuryService();
  bindTradeService(engine, trade);
  bindTreasuryService(engine, treasury);
  getJobService(engine).setWagePayer(payWageFromTreasury);
  engine.taskHandlers.register(createTraderVisitTask(engine));
  registerSellJob(engine);
  registerBuyJob(engine);
  engine.store.addBeforeDeleteHook((entity) => {
    cancelOffersOf(engine, entity.id);
    const data = getComponent(entity, traderComponent);
    if (data !== undefined) {
      const storage = getStorageService(engine);
      storage.reservations.releaseHolder(entity.id);
      storage.reservations.releaseInventory(entity.id);
      const payload: TraderVisitEvent = {
        entityId: entity.id,
        traderPrototypeId: entity.prototype,
        factionId: data.factionId,
      };
      engine.bus.emit(traderLeftEvent, payload);
    }
    return null;
  });
  engine.bus.subscribe(standingChangedEvent, () => {
    cancelHostileOffers(engine);
  });
  engine.registerSystem({
    id: treasurySystemId,
    dependencies: [factionsSystemId, jobsSystemId],
    slot: TickSlot.StockpileTradeTreasury,
    order: 0,
    saveSection: treasury.createSection(),
    init: ({ engine: target, mode }) => {
      installTreasury(target, mode === InitMode.NewGame);
    },
    run: () => {
      retryWagePayments(engine);
    },
    queries: {
      treasury: defineQuery({
        schema: noArgs,
        run: (_args, target) => buildTreasuryView(target),
      }),
    },
  });
  engine.registerSystem({
    id: tradeSystemId,
    dependencies: [aiSystemId, jobsSystemId, storageSystemId, treasurySystemId],
    slot: TickSlot.StockpileTradeTreasury,
    order: 1,
    components: [merchantComponent, traderComponent],
    saveSection: trade.createSection(),
    init: ({ engine: target, mode }) => {
      if (mode === InitMode.NewGame) {
        initTraderVisits(target);
      }
    },
    run: (context) => {
      processOffers(engine, context.tick);
      postTradeJobs(engine, context.tick);
      for (const trader of listTraders(engine)) {
        topUpRefinedStash(engine, trader);
      }
    },
    commandHandlers: {
      SetSellsItems: defineCommand({
        schema: z.object({ entityId: idSchema, value: z.boolean() }).strict(),
        handler: (payload, target) => {
          ensureMerchant(target, payload.entityId);
          const merchant = getComponent(target.store.require(payload.entityId), merchantComponent);
          if (merchant !== undefined) {
            merchant.sellsItems = payload.value;
          }
          return { entityId: payload.entityId, sellsItems: payload.value };
        },
      }),
      SetPriceMultiplier: defineCommand({
        schema: z.object({ entityId: idSchema, multiplierMilli: z.number().int().min(0) }).strict(),
        handler: (payload, target) => {
          ensureMerchant(target, payload.entityId);
          const merchant = getComponent(target.store.require(payload.entityId), merchantComponent);
          if (merchant !== undefined) {
            merchant.priceMultiplierMilli = payload.multiplierMilli;
          }
          return { entityId: payload.entityId, multiplierMilli: payload.multiplierMilli };
        },
      }),
      ProposeTrade: defineCommand({
        schema: proposeSchema,
        handler: (payload, target) => ({
          offerId: proposeOffer(
            target,
            {
              buyerId: payload.buyerId,
              sellerId: payload.sellerId,
              requested: payload.requested,
              offered: payload.offeredItems,
              coins: payload.offeredCoins,
            },
            target.time.tickCount,
          ).offerId,
        }),
      }),
      WithdrawTradeOffer: defineCommand({
        schema: z.object({ offerId: idSchema }).strict(),
        handler: (payload, target) => {
          if (!cancelOffer(target, payload.offerId, "withdrawn")) {
            throw new TradeError(
              TradeErrorKind.UnknownOffer,
              `offer ${payload.offerId} does not exist`,
            );
          }
          return { withdrawn: true };
        },
      }),
      AcceptTradeCounter: defineCommand({
        schema: z.object({ offerId: idSchema }).strict(),
        handler: (payload, target) => {
          const next = acceptCounter(target, payload.offerId, target.time.tickCount);
          return { round: next === null ? null : next.round };
        },
      }),
      TradeSell: defineCommand({
        schema: orderSchema,
        handler: (payload, target) => placeOrder(target, OrderDirection.Sell, payload),
      }),
      TradeBuy: defineCommand({
        schema: orderSchema,
        handler: (payload, target) => placeOrder(target, OrderDirection.Buy, payload),
      }),
      CancelTradeOrder: defineCommand({
        schema: z.object({ orderId: idSchema }).strict(),
        handler: (payload, target) => {
          cancelTradeOrder(target, payload.orderId, cancelledByPlayerReason, target.time.tickCount);
          return { cancelled: true };
        },
      }),
    },
    queries: {
      traders: defineQuery({ schema: noArgs, run: (_args, target) => buildTradersView(target) }),
      "trade-offers": defineQuery({
        schema: noArgs,
        run: (_args, target) => buildOfferViews(target),
      }),
      "trade-orders": defineQuery({
        schema: noArgs,
        run: (_args, target) => buildOrderViews(target),
      }),
      "trade-ledger": defineQuery({
        schema: noArgs,
        run: (_args, target) => buildLedgerViews(target),
      }),
      "trade-quote": defineQuery({
        schema: z
          .object({
            traderId: idSchema,
            direction: z.nativeEnum(OrderDirection),
            materialId: z.string().min(1),
            quantity: z.number().int().min(1).default(1),
          })
          .strict(),
        run: (args, target) =>
          buildQuoteView(target, args.traderId, args.direction, args.materialId, args.quantity),
      }),
    },
  });
  engine.registerSystem({
    id: traderVisitSystemId,
    dependencies: [tradeSystemId],
    slot: TickSlot.Diplomacy,
    run: (context) => {
      runTraderVisits(engine, context.tick);
    },
  });
  return trade;
}
