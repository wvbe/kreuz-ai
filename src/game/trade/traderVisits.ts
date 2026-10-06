import { getAiService } from "../ai/aiServiceRegistry";
import { getComponent } from "../ecs/Entity";
import type { Entity } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { ensureContentFaction } from "../factions/factionRegistry";
import { credit } from "../inventory/inventoryMoney";
import { storeUpTo } from "../inventory/inventoryOperations";
import { listBoards } from "../jobs/jobBoards";
import { positionComponent } from "../map/positionComponent";
import { ticksPerDay } from "../time/GameTime";
import { isFactionHostile } from "./tradeEvaluation";
import { topUpRefinedStash } from "./refinedLedger";
import { getTradeService } from "./tradeServiceRegistry";
import {
  TraderPhase,
  traderVisitStreamName,
  traderVisitTaskPriority,
  traderVisitTaskType,
} from "./tradeTypes";
import { traderComponent } from "./traderComponent";

/**
 * The cell where caravans set up: the cell of the first job board, the settlement's centre (the
 * village layout puts the board there). A settlement without a board gets no visitors.
 *
 * @param engine - The engine.
 * @returns The map and cell, or null.
 */
export function marketCell(engine: GameEngine): { mapId: number; cellIndex: number } | null {
  for (const board of listBoards(engine)) {
    const place = getComponent(board, positionComponent);
    if (place !== undefined) {
      return { mapId: place.mapId, cellIndex: place.cellIndex };
    }
  }
  return null;
}

/**
 * The ids of the prototypes that make caravans (they carry a `Trader` component), ascending.
 *
 * @param engine - The engine.
 * @returns Prototype ids.
 */
export function traderPrototypeIds(engine: GameEngine): string[] {
  return engine.prototypes
    .ids()
    .filter((id) => engine.prototypes.instantiate(id)["Trader"] !== undefined);
}

function jitter(engine: GameEngine): number {
  const max = engine.content.constants.traderVisitJitterTicks;
  return max < 1 ? 0 : engine.prng.stream(traderVisitStreamName).nextInt(0, max);
}

/**
 * Creates the visit schedule of a new game: each kind of trader first arrives on day
 * `traderVisitStartDay` plus a jitter drawn from the stream `trade.visit` (spec 019 plan 4.1:
 * the same seed gives the same arrival ticks).
 *
 * @param engine - The engine.
 */
export function initTraderVisits(engine: GameEngine): void {
  const service = getTradeService(engine);
  for (const id of traderPrototypeIds(engine)) {
    service.putVisit({
      traderPrototypeId: id,
      nextArrivalTick: engine.content.constants.traderVisitStartDay * ticksPerDay + jitter(engine),
      entityId: null,
    });
  }
}

/**
 * Fills a trader's inventory for a visit: its purse (`purseCoins` coins), each good it sells up to
 * its level, and the stash of every refined good the settlement has credit for (D-13).
 *
 * @param engine - The engine.
 * @param trader - The trader entity.
 */
export function restockTrader(engine: GameEngine, trader: Entity): void {
  const data = getComponent(trader, traderComponent);
  if (data === undefined) {
    return;
  }
  const context = { materials: engine.materials, actor: null };
  if (data.purseCoins > 0) {
    credit(context, trader, data.purseCoins);
  }
  for (const entry of data.sells) {
    storeUpTo(context, trader, entry.materialId, entry.quantity);
  }
  topUpRefinedStash(engine, trader);
}

/**
 * Picks where a caravan enters the map: one of the reachable cells that are among the farthest
 * (path cost at least nine tenths of the largest) from the market, chosen from the stream
 * `trade.visit`.
 *
 * @param engine - The engine.
 * @param market - The market cell.
 * @returns The cell index, or null when nothing is reachable.
 */
export function pickEntryCell(
  engine: GameEngine,
  market: { mapId: number; cellIndex: number },
): number | null {
  const reachable = getAiService(engine).pathfinding.reachable(market.mapId, market.cellIndex);
  const farthest = reachable.reduce((most, entry) => Math.max(most, entry.cost), 0);
  const cells = reachable
    .filter((entry) => entry.cost * 10 >= farthest * 9 && entry.cell !== market.cellIndex)
    .map((entry) => entry.cell)
    .sort((left, right) => left - right);
  return cells.length === 0
    ? null
    : (cells[engine.prng.stream(traderVisitStreamName).nextBelow(cells.length)] ?? null);
}

/**
 * Sends a caravan of one kind: spawns it at an entry cell, fills it and gives it the
 * `trader.visit` task (walk to the market, stay `traderStayDays`, walk out and leave).
 *
 * @param engine - The engine.
 * @param prototypeId - The trader prototype.
 * @returns The new entity, or null when there is no market or no way in.
 */
export function spawnTrader(engine: GameEngine, prototypeId: string): Entity | null {
  const market = marketCell(engine);
  const entry = market === null ? null : pickEntryCell(engine, market);
  if (market === null || entry === null) {
    return null;
  }
  const contentId = engine.prototypes.instantiate(prototypeId)["Trader"]?.["factionContentId"];
  const faction =
    typeof contentId === "string" ? ensureContentFaction(engine, contentId) : undefined;
  if (faction === undefined) {
    return null;
  }
  const trader = engine.store.spawn(prototypeId, {
    Position: { mapId: market.mapId, cellIndex: entry },
    Trader: { factionId: faction.id },
  });
  engine.maps.placeEntity(trader.id, market.mapId, entry);
  restockTrader(engine, trader);
  engine.tasks.enqueue(trader.id, {
    type: traderVisitTaskType,
    data: { mapId: market.mapId, marketCell: market.cellIndex, exitCell: entry },
    priority: traderVisitTaskPriority,
  });
  return trader;
}

/**
 * The caravans on the map, ascending by entity id (not those about to be deleted).
 *
 * @param engine - The engine.
 * @returns Entities with a `Trader` component.
 */
export function listTraders(engine: GameEngine): Entity[] {
  return engine.store
    .entities()
    .filter(
      (entity) =>
        getComponent(entity, traderComponent) !== undefined &&
        !engine.store.isPendingDelete(entity.id),
    );
}

/**
 * The caravan of a kind that is at the market and open for trade.
 *
 * @param engine - The engine.
 * @param prototypeId - The trader prototype id.
 * @returns The entity, or null when none is present.
 */
export function presentTrader(engine: GameEngine, prototypeId: string): Entity | null {
  return (
    listTraders(engine).find(
      (entity) =>
        entity.prototype === prototypeId &&
        getComponent(entity, traderComponent)?.phase === TraderPhase.Present,
    ) ?? null
  );
}

/**
 * The visit pass (slot 11): a caravan whose entity is gone schedules the next visit
 * `traderVisitIntervalDays` later plus a jitter; a kind whose arrival tick has come sends a
 * caravan unless its faction is hostile (it tries again a day later); a kind without a market or
 * way in tries again a day later too.
 *
 * @param engine - The engine.
 * @param tick - The tick being processed.
 */
export function runTraderVisits(engine: GameEngine, tick: number): void {
  const service = getTradeService(engine);
  const constants = engine.content.constants;
  for (const record of service.visits()) {
    if (record.entityId !== null) {
      const alive =
        engine.store.has(record.entityId) && !engine.store.isPendingDelete(record.entityId);
      if (!alive) {
        service.putVisit({
          ...record,
          entityId: null,
          nextArrivalTick: tick + constants.traderVisitIntervalDays * ticksPerDay + jitter(engine),
        });
      }
      continue;
    }
    if (tick < record.nextArrivalTick) {
      continue;
    }
    const contentId = engine.prototypes.instantiate(record.traderPrototypeId)["Trader"]?.[
      "factionContentId"
    ];
    const faction =
      typeof contentId === "string" ? ensureContentFaction(engine, contentId) : undefined;
    const trader =
      faction === undefined || isFactionHostile(engine, faction.id)
        ? null
        : spawnTrader(engine, record.traderPrototypeId);
    service.putVisit({
      ...record,
      entityId: trader === null ? null : trader.id,
      nextArrivalTick: trader === null ? tick + ticksPerDay : record.nextArrivalTick,
    });
  }
}
