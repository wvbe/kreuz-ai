import type { EntityId } from "../ecs/Entity";
import { findFactionByContentId, governmentFactionId } from "../factions/factionRegistry";
import { joinFaction } from "../factions/factionMembership";
import { setFactionLeader } from "../factions/factionLeader";
import { createTradeWorld } from "../trade/testTradeWorld";
import type { TradeTestWorld } from "../trade/testTradeWorld";
import type { JobTestWorldOptions } from "../jobs/testJobWorld";
import { needsComponent } from "../ai/needs/needsComponent";
import { spawnNpcFactions } from "./npcFactions";

/**
 * A trade test world (square map, board at cell 0, treasury) with the NPC factions of the content
 * pack seeded (`spawnNpcFactions`) and a leader for the player's government.
 */
export type DiplomacyTestWorld = TradeTestWorld & {
  /**
   * The player's government faction.
   */
  government: EntityId;
  /**
   * The NPC faction entity bound to a content faction id (`ashford_barony`, `wulfric_abbey`,
   * `merchant_caravans`); throws when there is none.
   */
  npc: (contentId: string) => EntityId;
};

/**
 * Builds a {@link DiplomacyTestWorld}: a 10x10 map with the board (the market, the government's
 * seat) at cell 55; the NPC seats are at the edges (north and west cell 0, east cell 9); the settler at cell 1 becomes the government's leader (so
 * NPC envoys have somebody to reach) and has no needs, so it never starves.
 *
 * @param options - Map size, difficulty, seed and board cell.
 * @returns The world.
 */
export function createDiplomacyWorld(options: JobTestWorldOptions = {}): DiplomacyTestWorld {
  const world = createTradeWorld({ boardCell: 55, ...options });
  const government = governmentFactionId(world.engine);
  if (government === null) {
    throw new Error("the test world has no government faction");
  }
  const leader = world.settler(1);
  // the leader neither eats nor starves: a diplomacy test may run for days
  world.engine.store.removeComponent(leader.id, needsComponent);
  joinFaction(world.engine, leader.id, government);
  setFactionLeader(world.engine, government, leader.id);
  spawnNpcFactions(world.engine);
  return {
    ...world,
    government,
    npc: (contentId) => {
      const found = findFactionByContentId(world.engine, contentId);
      if (found === null) {
        throw new Error(`no faction ${contentId}`);
      }
      return found.id;
    },
  };
}
