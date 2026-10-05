import { getComponent } from "../ecs/Entity";
import type { Entity, EntityId } from "../ecs/Entity";
import type { GameEngine } from "../engine/GameEngine";
import { skillsComponent } from "../skills/skillsComponent";
import { factionComponent } from "./factionComponent";
import { FactionError, FactionErrorKind } from "./FactionError";
import { isMember, membersOf } from "./factionMembership";
import { factionLeaderChangedEvent } from "./factionTypes";
import type { FactionLeaderChanged } from "./factionTypes";

/**
 * Sets the one leader of a faction (spec 021 FR-003) and queues `faction.leader.changed`
 * (DECISIONS D-14). The leader must be a member; `null` makes the faction leaderless. Setting the
 * current leader again does nothing.
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The faction entity.
 * @param leaderId - The new leader, or null.
 * @returns True when the leader changed.
 */
export function setFactionLeader(
  engine: GameEngine,
  factionId: EntityId,
  leaderId: EntityId | null,
): boolean {
  const faction = getComponent(engine.store.require(factionId), factionComponent);
  if (faction === undefined) {
    throw new FactionError(FactionErrorKind.UnknownFaction, `entity ${factionId} is not a faction`);
  }
  if (leaderId !== null && !isMember(engine, leaderId, factionId)) {
    throw new FactionError(
      FactionErrorKind.NotMember,
      `entity ${leaderId} is not a member of faction ${factionId}`,
    );
  }
  if (faction.leaderId === leaderId) {
    return false;
  }
  const payload: FactionLeaderChanged = {
    factionId,
    oldLeaderId: faction.leaderId,
    newLeaderId: leaderId,
  };
  faction.leaderId = leaderId;
  engine.bus.emit(factionLeaderChangedEvent, payload);
  return true;
}

function totalSkill(entity: Entity): number {
  return Object.values(getComponent(entity, skillsComponent)?.values ?? {}).reduce(
    (sum, value) => sum + value,
    0,
  );
}

/**
 * The succession rule of DECISIONS D-14: of the faction's members the one with the greatest total
 * skill, ties to the lowest entity id. Pure, no PRNG. (The "adult" condition of D-14 is not
 * applied until citizens have an age.)
 *
 * @param engine - The engine that owns the entities.
 * @param factionId - The faction entity.
 * @returns The candidate's id, or null when the faction has no members.
 */
export function pickLeaderCandidate(engine: GameEngine, factionId: EntityId): EntityId | null {
  let best: Entity | null = null;
  let bestTotal = -1;
  for (const member of membersOf(engine, factionId)) {
    const total = totalSkill(member);
    if (total > bestTotal) {
      best = member;
      bestTotal = total;
    }
  }
  return best === null ? null : best.id;
}
