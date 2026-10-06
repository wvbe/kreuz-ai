import { ContentFile } from "../content/contentTypes";
import { bundledContentFiles, loadContentPack } from "../content/ContentLoader";
import type { ContentRegistries } from "../content/ContentRegistries";
import type { EntityId } from "../ecs/Entity";
import type { JsonValue } from "../engine/EventBus";
import { governmentFactionId } from "../factions/factionRegistry";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import { ticksPerDay } from "../time/GameTime";
import { createTradeWorld } from "../trade/testTradeWorld";
import type { TradeTestWorld } from "../trade/testTradeWorld";
import { getSettlementService } from "./settlementServiceRegistry";
import { settlementProgressOf } from "./settlementProgressOf";
import type { SettlementProgressData } from "./settlementTypes";

/**
 * A trade test world (square map, treasury, settlers who join the government) with the settlement
 * system's helpers.
 */
export type SettlementTestWorld = TradeTestWorld & {
  /**
   * The player's government faction.
   */
  government: EntityId;
  /**
   * Spawns settlers (peasants without AI, members of the government) on the next free cells.
   */
  addSettlers: (count: number) => EntityId[];
  /**
   * Installs a dwelling counter that answers `count` for every level (the housing hook).
   */
  setDwellings: (count: number) => void;
  /**
   * Runs until the clock reaches the start of a day (tick `day * 288`).
   */
  runToDay: (day: number) => void;
  /**
   * The live `SettlementProgress` data.
   */
  progress: () => SettlementProgressData;
  /**
   * Every `settlement.tier.reached` payload so far.
   */
  tierEvents: JsonValue[];
  /**
   * Every `settlement.milestone.reached` payload so far.
   */
  milestoneEvents: JsonValue[];
};

/**
 * The bundled pack with another `settlement-tiers.json` (raw JSON records), for tests of tiers
 * whose requirements the shipped table does not use.
 *
 * @param tiers - The tier records.
 * @returns Fresh registries.
 */
export function contentWithTiers(tiers: JsonValue[]): ContentRegistries {
  return loadContentPack({ ...bundledContentFiles, [ContentFile.SettlementTiers]: tiers });
}

/**
 * Builds a {@link SettlementTestWorld}.
 *
 * @param options - Map size, difficulty, seed, board cell and content.
 * @returns The world.
 */
export function createSettlementWorld(options: JobTestWorldOptions = {}): SettlementTestWorld {
  const world = createTradeWorld(options);
  const government = governmentFactionId(world.engine);
  if (government === null) {
    throw new Error("the test world has no government faction");
  }
  let nextCell = 20;
  return {
    ...world,
    government,
    tierEvents: world.record("settlement.tier.reached"),
    milestoneEvents: world.record("settlement.milestone.reached"),
    addSettlers: (count) => {
      const ids: EntityId[] = [];
      for (let index = 0; index < count; index += 1) {
        ids.push(world.settler(nextCell).id);
        nextCell += 1;
      }
      return ids;
    },
    setDwellings: (count) => {
      getSettlementService(world.engine).setDwellingCounter(() => count);
    },
    runToDay: (day) => {
      const target = day * ticksPerDay;
      world.engine.runTicks(target - world.engine.time.tickCount);
    },
    progress: () => {
      const data = settlementProgressOf(world.engine);
      if (data === null) {
        throw new Error("no settlement progress");
      }
      return data;
    },
  };
}
