import { noAiOverride } from "../jobs/testJobWorld";
import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { SpawnOverrides } from "../ai/testAiWorld";
import { ensureContentFaction, governmentFactionId } from "../factions/factionRegistry";
import { joinFaction } from "../factions/factionMembership";
import { inventoryComponent } from "../inventory/inventoryComponent";
import { getBalance } from "../inventory/inventoryMoney";
import { createStorageWorld } from "../storage/testStorageWorld";
import type { StorageTestWorld } from "../storage/testStorageWorld";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import type { JsonValue } from "../engine/EventBus";
import { TraderPhase, traderPrototypeId } from "./tradeTypes";
import { restockTrader } from "./traderVisits";
import { treasuryBalance } from "./treasury";

/**
 * A storage test world (square map, board at cell 0) plus trade helpers.
 */
export type TradeTestWorld = StorageTestWorld & {
  /**
   * Spawns a restocked caravan that is already at the market (phase `Present`, no visit task) on
   * a cell; `overrides` change its components, for example `{ Trader: { purseCoins: 5 } }`.
   */
  trader: (cell: number, overrides?: SpawnOverrides) => Entity;
  /**
   * Spawns a peasant the AI leaves alone and makes it a member of the government faction.
   */
  settler: (cell: number) => Entity;
  /**
   * Coins an entity holds.
   */
  coins: (entityId: EntityId) => number;
  /**
   * Coins in the treasury.
   */
  treasury: () => number;
  /**
   * Runs a registered command handler by kind (at once, like the command slot would).
   */
  command: (kind: string, payload: JsonValue) => JsonValue;
  /**
   * Runs a registered query by name.
   */
  query: (name: string, args?: JsonValue) => JsonValue;
  /**
   * Starts recording the payloads of an event pattern; the returned array fills while the world
   * runs.
   */
  record: (pattern: string) => JsonValue[];
};

/**
 * Builds a {@link TradeTestWorld}. The government faction has its treasury (`startingTreasury`
 * coins); the world has a job board at cell 0, so caravans of the visit system can come too.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createTradeWorld(options: JobTestWorldOptions = {}): TradeTestWorld {
  const world = createStorageWorld(options);
  return {
    ...world,
    trader: (cell, overrides = {}) => {
      const content = world.engine.prototypes.instantiate(traderPrototypeId)["Trader"];
      const contentId = content?.["factionContentId"];
      const faction = ensureContentFaction(
        world.engine,
        typeof contentId === "string" ? contentId : "merchant_caravans",
      );
      const trader = world.spawn(traderPrototypeId, cell, {
        ...overrides,
        Trader: {
          factionId: faction.id,
          phase: TraderPhase.Present,
          arrivedTick: world.engine.time.tickCount,
          departTick: world.engine.time.tickCount + 100000,
          ...overrides["Trader"],
        },
      });
      restockTrader(world.engine, trader);
      return trader;
    },
    settler: (cell) => {
      const settler = world.spawn("peasant", cell, noAiOverride);
      const government = governmentFactionId(world.engine);
      if (government !== null) {
        joinFaction(world.engine, settler.id, government);
      }
      return settler;
    },
    coins: (entityId) =>
      getBalance(
        { materials: world.engine.materials, actor: null },
        world.engine.store.require(entityId),
      ),
    treasury: () => treasuryBalance(world.engine),
    command: (kind, payload) => {
      const registration = world.engine.getCommandHandler(kind);
      if (registration === undefined) {
        throw new Error(`no command ${kind}`);
      }
      return registration.handler(payload, world.engine);
    },
    query: (name, args = {}) => {
      const registration = world.engine.getQuery(name);
      if (registration === undefined) {
        throw new Error(`no query ${name}`);
      }
      return registration.run(args, world.engine);
    },
    record: (pattern) => {
      const seen: JsonValue[] = [];
      world.engine.bus.subscribe(pattern, (payload: JsonValue) => {
        seen.push(payload);
      });
      return seen;
    },
  };
}

/**
 * Fills up an inventory for a test: no free slot is left, so nothing new fits, while the stacks
 * that exist can still grow.
 *
 * @param entity - Entity with an inventory.
 */
export function fullInventory(entity: Entity): void {
  const data = getComponent(entity, inventoryComponent);
  if (data !== undefined) {
    data.slotCount = data.slots.length;
  }
}
