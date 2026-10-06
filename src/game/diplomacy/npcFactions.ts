import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { setFactionLeader, pickLeaderCandidate } from "../factions/factionLeader";
import { joinFaction } from "../factions/factionMembership";
import { ensureContentFaction, governmentFactionId } from "../factions/factionRegistry";
import { setStanding } from "../factions/factionStanding";
import { assignIdentity } from "../identity/assignIdentity";
import { marketCell } from "../trade/traderVisits";
import { pickSeatCell } from "./factionSeats";
import { npcLeaderPrototypeId, npcStartingMembers } from "./diplomacyTypes";

/**
 * Spawns one member of an NPC faction: a citizen without a position (NPC factions live off the
 * map, D-56) who joins the faction and is named by `assignIdentity`. The leader and the heirs are
 * made this way.
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The NPC faction.
 * @returns The new entity.
 */
export function spawnNpcMember(engine: GameEngine, factionId: EntityId): Entity {
  const member = engine.store.spawn(npcLeaderPrototypeId);
  joinFaction(engine, member.id, factionId);
  assignIdentity(engine, member.id);
  return member;
}

/**
 * Seeds the NPC factions of a new game (D-14, D-56): every content faction with an `npc` block
 * gets its entity, a seat on the edge of the main map, `npcStartingMembers` members (leader and
 * heir; the leader is the one `pickLeaderCandidate` names) and the starting standing both ways.
 * Nothing is drawn from a stream except the member names (`identity.names`). A game without a map
 * (no job board to measure from) gets none.
 *
 * @param engine - The engine in `NewGame` init, after the world generator ran.
 * @returns The NPC faction ids in content order.
 */
export function spawnNpcFactions(engine: GameEngine): EntityId[] {
  const market = marketCell(engine);
  const government = governmentFactionId(engine);
  if (market === null || government === null) {
    return [];
  }
  const ids: EntityId[] = [];
  for (const record of engine.content.factions.all()) {
    if (record.npc === undefined) {
      continue;
    }
    const entity = ensureContentFaction(engine, record.id);
    const faction = getComponent(entity, factionComponent);
    if (faction === undefined) {
      continue;
    }
    faction.seat = {
      mapId: market.mapId,
      cellIndex: pickSeatCell(engine, market.mapId, record.npc.side),
    };
    for (let index = 0; index < npcStartingMembers; index += 1) {
      spawnNpcMember(engine, entity.id);
    }
    setFactionLeader(engine, entity.id, pickLeaderCandidate(engine, entity.id));
    setStanding(engine, entity.id, government, record.npc.standingTowardSettlement);
    setStanding(engine, government, entity.id, record.npc.settlementStandingToward);
    ids.push(entity.id);
  }
  return ids;
}
