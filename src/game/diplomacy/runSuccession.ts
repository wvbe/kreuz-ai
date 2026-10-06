import { getComponent } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { factionComponent } from "../factions/factionComponent";
import { pickLeaderCandidate, setFactionLeader } from "../factions/factionLeader";
import { listFactions } from "../factions/factionRegistry";
import { spawnNpcMember } from "./npcFactions";

/**
 * The succession pass of D-14 (slot 11, every tick): a faction whose `leaderId` is null picks the
 * member `pickLeaderCandidate` names (greatest total skill, ties lowest id) and sets it with
 * `faction.leader.changed`. A faction without members stays leaderless, except an NPC faction (it
 * has a seat): a new heir is born into it first, so NPC diplomacy never dies out (D-56). The
 * styled name of the new leader shows the office through the identity module, which reads
 * `Faction.leaderId`.
 *
 * @param engine - The engine that owns the entities.
 * @returns The number of leaders appointed.
 */
export function runSuccession(engine: GameEngine): number {
  let appointed = 0;
  for (const entity of listFactions(engine)) {
    const faction = getComponent(entity, factionComponent);
    if (
      faction === undefined ||
      faction.leaderId !== null ||
      engine.store.isPendingDelete(entity.id)
    ) {
      continue;
    }
    let candidate = pickLeaderCandidate(engine, entity.id);
    if (candidate === null && faction.seat !== null) {
      candidate = spawnNpcMember(engine, entity.id).id;
    }
    if (candidate !== null && setFactionLeader(engine, entity.id, candidate)) {
      appointed += 1;
    }
  }
  return appointed;
}
